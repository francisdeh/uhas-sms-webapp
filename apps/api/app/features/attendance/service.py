"""Business logic for student attendance.

The main flow is `upsert_session`: idempotent create-or-update in one
transaction. That's what the roster UI calls when the teacher hits
Save; behaviour on re-save is "replace all records", so mistakes fix
by resubmitting the whole class.

The service validates every studentId in the payload belongs to a
current-year Active enrollment in the target class — no ghost writes.
"""

from __future__ import annotations

import logging
from datetime import date as date_type
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.security import CurrentUser
from app.features.attendance.constants import ABSENT, EXCUSED, LATE, PRESENT
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.attendance.repository import AttendanceRepository
from app.features.attendance.schema import (
    AttendanceSessionUpsertRequest,
    StudentAttendanceCalendarEntry,
    StudentAttendanceSummary,
)
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.classes.repository import ClassesRepository
from app.features.classes.service import ClassesService
from app.features.enrollments.constants import ACTIVE as ACTIVE_ENROLLMENT
from app.features.enrollments.model import Enrollment
from app.features.notifications.constants import ATTENDANCE_ABSENT
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.users.model import User, UserPreferences

logger = logging.getLogger(__name__)

_DB_STATUS_TO_WIRE: dict[str, str] = {
    PRESENT: "present",
    ABSENT: "absent",
    LATE: "late",
    EXCUSED: "excused",
}


async def _class_roster_student_ids(
    session: AsyncSession, class_id: UUID | str, academic_year: str
) -> set[UUID]:
    """Set of student IDs actively enrolled in `class_id` this year."""
    stmt = select(Enrollment.student_id).where(
        and_(
            Enrollment.class_id == class_id,
            Enrollment.academic_year == academic_year,
            Enrollment.status == ACTIVE_ENROLLMENT,
        )
    )
    return {row for row in (await session.execute(stmt)).scalars().all()}


def _format_names(names: list[str]) -> tuple[str, str]:
    """`(joined names, "was"|"were")` — mirrors
    `exams/jobs/results_published_email.py`'s `_format_children`."""
    if len(names) == 1:
        return names[0], "was"
    if len(names) == 2:
        return f"{names[0]} and {names[1]}", "were"
    return ", ".join(names[:-1]) + f", and {names[-1]}", "were"


async def _notify_attendance_absences(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    student_ids: set[UUID],
    date: date_type,
) -> None:
    """Fans out `ATTENDANCE_ABSENT` to each newly-absent student's
    primary guardian — `student_ids` must already be filtered to
    "new status is Absent AND previous status wasn't" by the caller
    (`upsert_session`); this helper does no dedup of its own. One
    in-app notification + one email + one SMS per guardian, combining
    every one of their newly-absent children into a single message —
    same batching shape as `ExamsService._notify_results_published`.
    """
    if not student_ids:
        return

    school = await SchoolsRepository.get_by_id(session, school_id)
    defaults = (school.notification_defaults if school else None) or {}
    # Defaults off (unlike every other domain's toggle) — a school must
    # explicitly opt in via Settings → Communication before this ever
    # fires, given the volume/sensitivity profile of daily attendance.
    if not defaults.get("on_attendance_absent", False):
        return

    recipients = await AttendanceRepository.list_primary_guardians_for_students(
        session, school_id, student_ids
    )
    if not recipients:
        return

    by_guardian: dict[UUID, tuple[User, UUID, str | None, list[str]]] = {}
    for student, guardian, user in recipients:
        if user is None:
            continue
        student_name = f"{student.first_name} {student.last_name}"
        _, _, phone, names = by_guardian.get(user.id, (user, guardian.id, guardian.phone, []))
        names.append(student_name)
        by_guardian[user.id] = (user, guardian.id, phone, names)

    school_name = school.name if school else "UHAS SMS"
    school_address = (school.address if school else None) or ""
    school_contact_email = (school.email if school else None) or ""

    for user, guardian_id, phone, names in by_guardian.values():
        student_names, was_were = _format_names(names)
        body = f"{student_names} {was_were} marked absent today ({date.isoformat()})."
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=user.id,
            payload=NotifyPayload(
                kind=ATTENDANCE_ABSENT,
                title="Attendance: marked absent",
                body=body,
                link="/parent/attendance",
            ),
        )

        prefs = await session.scalar(
            select(UserPreferences).where(UserPreferences.user_id == user.id)
        )
        email_allowed = getattr(prefs, "email_on_attendance_absent", True) if prefs else True
        sms_allowed = getattr(prefs, "sms_on_attendance_absent", True) if prefs else True

        if user.email and email_allowed:
            try:
                await inngest_client.send(
                    inngest.Event(
                        name="email/attendance-absent.requested",
                        data={
                            "guardian_email": user.email,
                            "student_names": student_names,
                            "was_were": was_were,
                            "date": date.isoformat(),
                            "link": "/parent/attendance",
                            "school_name": school_name,
                            "school_address": school_address,
                            "school_contact_email": school_contact_email,
                            "preferences_link": "/parent/profile?tab=notifications",
                        },
                    )
                )
            except Exception:
                logger.exception(
                    "Failed to emit email/attendance-absent.requested for school %s", school_id
                )
                sentry_sdk.capture_exception()

        if phone and sms_allowed:
            try:
                await inngest_client.send(
                    inngest.Event(
                        name="sms/fanout.requested",
                        data={
                            "school_id": str(school_id),
                            "category": "absence",
                            "body": f"{body} Check UHAS SMS for details.",
                            "recipients": [{"phone": phone, "guardian_id": str(guardian_id)}],
                        },
                    )
                )
            except Exception:
                logger.exception("Failed to emit attendance SMS fan-out for school %s", school_id)
                sentry_sdk.capture_exception()


class AttendanceService:
    @staticmethod
    async def upsert_session(
        session: AsyncSession,
        school_id: UUID | str,
        payload: AttendanceSessionUpsertRequest,
        *,
        user: CurrentUser,
        actor_staff_id: UUID | str | None,
        academic_year: str,
    ) -> AttendanceSession:
        """Create or update the session for `(class_id, date)` + replace
        its records with `payload.records`.

        Role gate: Admin any class; DeputyHead only their own division;
        Teacher only classes they class-teach or subject-teach; Parent/
        Accountant always forbidden — see
        `ClassesService.assert_can_access_class`.
        """
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        await ClassesService.assert_can_access_class(session, school_id, user, cls)

        # Validate every studentId is actually enrolled — prevents typos +
        # cross-school leakage via a fabricated UUID.
        roster = await _class_roster_student_ids(session, payload.class_id, academic_year)
        payload_ids = {r.student_id for r in payload.records}
        stray = payload_ids - roster
        if stray:
            raise ValidationError(
                f"{len(stray)} record(s) reference students not enrolled in this class."
            )

        existing = await AttendanceRepository.find_session(
            session, school_id, class_id=payload.class_id, date=payload.date
        )
        previous_status: dict[UUID, str] = {}
        if existing:
            existing.term = payload.term
            existing.submitted_by_id = actor_staff_id  # type: ignore[assignment]
            attendance_session = existing
            # Captured before the delete — `upsert_session` replaces the
            # whole session on every save, so this is the only way to
            # tell "still absent from last save" (silent) apart from
            # "newly absent this save" (notifies) — see
            # `_notify_attendance_absences`.
            previous_status = {
                rec.student_id: rec.status
                for rec, _student in await AttendanceRepository.list_records(
                    session, attendance_session.id
                )
            }
            await AttendanceRepository.delete_records(session, attendance_session.id)
        else:
            attendance_session = AttendanceSession(
                school_id=school_id,
                class_id=payload.class_id,
                date=payload.date,
                term=payload.term,
                submitted_by_id=actor_staff_id,
            )
            session.add(attendance_session)
            await session.flush()

        newly_absent_ids = {
            r.student_id
            for r in payload.records
            if r.status == ABSENT and previous_status.get(r.student_id) != ABSENT
        }

        for r in payload.records:
            session.add(
                AttendanceRecord(
                    session_id=attendance_session.id,
                    student_id=r.student_id,
                    status=r.status,
                    late_reason=r.late_reason,
                    note=r.note,
                )
            )
        await session.flush()

        await _notify_attendance_absences(
            session, school_id, student_ids=newly_absent_ids, date=payload.date
        )

        return attendance_session

    @staticmethod
    async def get_session_with_records(
        session: AsyncSession,
        school_id: UUID | str,
        session_id: UUID | str,
    ) -> tuple[AttendanceSession, Class, Staff | None, list[tuple[AttendanceRecord, Student]]]:
        row = await AttendanceRepository.get_session(session, school_id, session_id)
        if not row:
            raise NotFoundError(f"Attendance session {session_id!r} not found.")
        sess, cls, staff = row
        records = await AttendanceRepository.list_records(session, sess.id)
        return sess, cls, staff, records

    @staticmethod
    async def find_session(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        class_id: UUID | str,
        date: date_type,
    ) -> AttendanceSession | None:
        """Idempotent-lookup for the UI ("was today's attendance already saved?")."""
        return await AttendanceRepository.find_session(
            session, school_id, class_id=class_id, date=date
        )

    @staticmethod
    async def list_sessions(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        class_id: UUID | str | None = None,
        term: int | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[AttendanceSession, Class, Staff | None, int, int, int, int]], int]:
        return await AttendanceRepository.list_sessions(
            session, school_id, class_id=class_id, term=term, page=page, size=size
        )

    @staticmethod
    async def _assert_can_view_student(
        session: AsyncSession,
        user: CurrentUser,
        *,
        school_id: UUID | str,
        student_id: UUID | str,
        academic_year: str,
    ) -> None:
        """Role gate for the parent-facing attendance endpoints.

        * Admin  — any student in the school.
        * Parent — must be linked via `student_guardians`.
        * Teacher — must class-teach the student's current class or
          teach any subject in it (matches `AppointmentsRepository`).
        * DeputyHead — student's current class division must match the
          deputy's `staff.division`.

        404 if the student is not in the caller's school; 403 for any
        role-scope miss.
        """
        student = await session.scalar(
            select(Student).where(and_(Student.id == student_id, Student.school_id == school_id))
        )
        if student is None:
            raise NotFoundError(f"Student {student_id!r} not found.")

        role = user.role
        if role == ADMIN:
            return

        if role == PARENT:
            if not user.linked_id:
                raise ForbiddenError("Parent identity missing.")
            link = await session.scalar(
                select(StudentGuardian.student_id).where(
                    and_(
                        StudentGuardian.student_id == student_id,
                        StudentGuardian.guardian_id == user.linked_id,
                    )
                )
            )
            if link is None:
                raise ForbiddenError("You may only view your own children.")
            return

        if role == TEACHER:
            if not user.linked_id:
                raise ForbiddenError("Teacher identity missing.")
            class_ids_subq = select(Enrollment.class_id).where(
                and_(
                    Enrollment.student_id == student_id,
                    Enrollment.academic_year == academic_year,
                    Enrollment.status == ACTIVE_ENROLLMENT,
                )
            )
            ct_stmt = select(ClassTeacher.class_id).where(
                and_(
                    ClassTeacher.staff_id == user.linked_id,
                    ClassTeacher.class_id.in_(class_ids_subq),
                )
            )
            cs_stmt = select(ClassSubject.class_id).where(
                and_(
                    ClassSubject.teacher_id == user.linked_id,
                    ClassSubject.class_id.in_(class_ids_subq),
                )
            )
            found = (await session.execute(ct_stmt.union(cs_stmt))).first()
            if found is None:
                raise ForbiddenError("You may only view students you teach.")
            return

        if role == DEPUTY_HEAD:
            if not user.linked_id:
                raise ForbiddenError("Deputy identity missing.")
            deputy_division = await session.scalar(
                select(Staff.division).where(Staff.id == user.linked_id)
            )
            if deputy_division is None:
                raise ForbiddenError("Deputy has no assigned division.")
            student_divisions = list(
                (
                    await session.execute(
                        select(Class.division)
                        .join(Enrollment, Enrollment.class_id == Class.id)
                        .where(
                            and_(
                                Enrollment.student_id == student_id,
                                Enrollment.academic_year == academic_year,
                                Enrollment.status == ACTIVE_ENROLLMENT,
                            )
                        )
                    )
                )
                .scalars()
                .all()
            )
            if deputy_division not in student_divisions:
                raise ForbiddenError("Student is not in your division.")
            return

        raise ForbiddenError("Not permitted.")

    @staticmethod
    async def get_student_summary(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        student_id: UUID | str,
        term_start: date_type,
        term_end: date_type,
    ) -> StudentAttendanceSummary:
        """Aggregate the student's status counts over the term window."""
        school = await SchoolsRepository.get_by_id(session, school_id)
        if school is None:
            raise NotFoundError(f"School {school_id!r} not found.")
        await AttendanceService._assert_can_view_student(
            session,
            user,
            school_id=school_id,
            student_id=student_id,
            academic_year=school.academic_year,
        )
        counts = await AttendanceRepository.sum_status_counts_for_student(
            session,
            school_id=school_id,
            student_id=student_id,
            term_start=term_start,
            term_end=term_end,
        )
        present = counts.get(PRESENT, 0)
        absent = counts.get(ABSENT, 0)
        late = counts.get(LATE, 0)
        excused = counts.get(EXCUSED, 0)
        return StudentAttendanceSummary(
            present_count=present,
            absent_count=absent,
            late_count=late,
            excused_count=excused,
            total_days=present + absent + late + excused,
        )

    @staticmethod
    async def get_student_calendar(
        session: AsyncSession,
        school_id: UUID | str,
        user: CurrentUser,
        *,
        student_id: UUID | str,
        term_start: date_type,
        term_end: date_type,
    ) -> list[StudentAttendanceCalendarEntry]:
        """One entry per recorded session-day. Days without a session are
        omitted (not returned as `no_session`)."""
        school = await SchoolsRepository.get_by_id(session, school_id)
        if school is None:
            raise NotFoundError(f"School {school_id!r} not found.")
        await AttendanceService._assert_can_view_student(
            session,
            user,
            school_id=school_id,
            student_id=student_id,
            academic_year=school.academic_year,
        )
        rows = await AttendanceRepository.per_day_status_for_student(
            session,
            school_id=school_id,
            student_id=student_id,
            term_start=term_start,
            term_end=term_end,
        )
        return [
            StudentAttendanceCalendarEntry(
                date=d,
                status=_DB_STATUS_TO_WIRE.get(status, "no_session"),
            )
            for d, status in rows
        ]
