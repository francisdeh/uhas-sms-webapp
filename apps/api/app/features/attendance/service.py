"""Business logic for student attendance.

The main flow is `upsert_session`: idempotent create-or-update in one
transaction. That's what the roster UI calls when the teacher hits
Save; behaviour on re-save is "replace all records", so mistakes fix
by resubmitting the whole class.

The service validates every studentId in the payload belongs to a
current-year Active enrollment in the target class — no ghost writes.
"""

from __future__ import annotations

from datetime import date as date_type
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.attendance.repository import AttendanceRepository
from app.features.attendance.schema import AttendanceSessionUpsertRequest
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.enrollments.constants import ACTIVE as ACTIVE_ENROLLMENT
from app.features.enrollments.model import Enrollment
from app.features.staff.model import Staff
from app.features.students.model import Student


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


class AttendanceService:
    @staticmethod
    async def upsert_session(
        session: AsyncSession,
        school_id: UUID | str,
        payload: AttendanceSessionUpsertRequest,
        *,
        actor_staff_id: UUID | str | None,
        academic_year: str,
    ) -> AttendanceSession:
        """Create or update the session for `(class_id, date)` + replace
        its records with `payload.records`."""
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")

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
        if existing:
            existing.term = payload.term
            existing.submitted_by_id = actor_staff_id  # type: ignore[assignment]
            attendance_session = existing
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
