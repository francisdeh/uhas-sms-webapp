"""Business logic for the class-report workflow.

State machine:  Draft → Submitted. Once submitted the class teacher
loses write access; Deputy Head (own division) + Admin can amend the
HOS comment.

Role gates (belt-and-braces — router deps do the coarse role check,
these enforce the fine-grained "which class" ownership):

  * List / Get / Draft PUT / Submit
      - Admin: any class
      - Deputy Head: any class in their division
      - Teacher: only classes they teach (via `class_teachers`)
      - Parent / Accountant: 403 (router-level)

  * HOS comment PATCH
      - Admin: any class
      - Deputy Head: only classes in their own division
      - Teacher / Parent / Accountant: 403

Draft PUT is transactional: `delete_remarks_for_exam_class` + N inserts
run inside the caller's session, so a failed insert rolls back the
delete. Submit is idempotent — a second POST on an already-submitted
report returns the same response, no state change.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.audit.actions import CLASS_REPORT_HOS_COMMENT_UPDATED
from app.features.audit.service import write_audit_log
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.exams.class_reports_repo import ClassReportsRepository
from app.features.exams.constants import CLASS_REPORT_DRAFT, CLASS_REPORT_SUBMITTED
from app.features.exams.model import ClassReportSubmission, Exam, StudentReportRemark
from app.features.exams.repository import ExamsRepository
from app.features.exams.schema import RemarkInput
from app.features.staff.repository import StaffRepository
from app.features.students.model import Student


def _now() -> datetime:
    """DB columns are TIMESTAMP WITHOUT TIME ZONE; strip tz so asyncpg
    doesn't error on tz-aware ↔ tz-naive conversion."""
    return datetime.now(UTC).replace(tzinfo=None)


def _to_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


class ClassReportsService:
    # ─── Read paths ─────────────────────────────────────────────────────

    @staticmethod
    async def list_for_exam(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        actor_role: str,
        actor_staff_id: UUID | str | None,
    ) -> list[tuple[ClassReportSubmission | None, Class]]:
        await _load_exam(session, school_id, exam_id)
        class_ids = await _visible_class_ids(session, school_id, actor_role, actor_staff_id)
        return await ClassReportsRepository.list_reports_for_exam(
            session,
            exam_id=exam_id,
            school_id=school_id,
            class_ids=class_ids,
        )

    @staticmethod
    async def get_detail(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        class_id: UUID | str,
        actor_role: str,
        actor_staff_id: UUID | str | None,
    ) -> tuple[
        ClassReportSubmission | None,
        Class,
        list[tuple[Student, StudentReportRemark | None]],
    ]:
        exam = await _load_exam(session, school_id, exam_id)
        cls = await _load_class(session, school_id, class_id)
        await _assert_can_view_class(session, school_id, actor_role, actor_staff_id, cls)
        report = await ClassReportsRepository.find_report(
            session, exam_id=exam_id, class_id=class_id
        )
        roster = await ClassReportsRepository.list_roster_with_remarks(
            session,
            exam_id=exam.id,
            class_id=cls.id,
            academic_year=cls.academic_year,
        )
        return report, cls, roster

    # ─── Write paths ────────────────────────────────────────────────────

    @staticmethod
    async def save_draft(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        class_id: UUID | str,
        hos_comment: str | None,
        remarks: list[RemarkInput],
        actor_role: str,
        actor_staff_id: UUID | str | None,
    ) -> ClassReportSubmission:
        """Upsert the draft — replaces remarks + HOS comment atomically.
        Rejects if the report is already submitted (class teacher lost
        write access at that point)."""
        exam = await _load_exam(session, school_id, exam_id)
        cls = await _load_class(session, school_id, class_id)
        await _assert_can_edit_draft(session, actor_role, actor_staff_id, cls)

        report = await ClassReportsRepository.find_report(session, exam_id=exam.id, class_id=cls.id)
        if report and report.status == CLASS_REPORT_SUBMITTED:
            raise ForbiddenError("Report already submitted; drafts can no longer be saved.")

        # Validate every remark's student is on the active roster —
        # the same cross-class-leakage guard scores use.
        roster = await ClassReportsRepository.list_roster_with_remarks(
            session,
            exam_id=exam.id,
            class_id=cls.id,
            academic_year=cls.academic_year,
        )
        roster_ids = {s.id for s, _ in roster}
        for r in remarks:
            if r.student_id not in roster_ids:
                raise ForbiddenError(
                    f"Student {r.student_id} is not on this class's active roster."
                )

        # Replace-in-place: delete all existing remarks for this
        # (exam, class-roster), then insert the payload. Runs inside the
        # request session so if any insert fails the delete rolls back.
        await ClassReportsRepository.delete_remarks_for_exam_class(
            session, exam_id=exam.id, student_ids=list(roster_ids)
        )
        now = _now()
        session.add_all(
            [
                StudentReportRemark(
                    exam_id=_to_uuid(exam.id),
                    student_id=_to_uuid(r.student_id),
                    class_teacher_remark=(r.text.strip() or None),
                    updated_at=now,
                )
                for r in remarks
            ]
        )

        if report is None:
            report = ClassReportSubmission(
                exam_id=_to_uuid(exam.id),
                class_id=_to_uuid(cls.id),
                status=CLASS_REPORT_DRAFT,
                head_of_school_comment=(hos_comment or None),
                updated_at=now,
            )
            session.add(report)
        else:
            report.head_of_school_comment = hos_comment or None
            report.updated_at = now
        await session.flush()
        return report

    @staticmethod
    async def submit(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        class_id: UUID | str,
        actor_role: str,
        actor_staff_id: UUID | str | None,
    ) -> ClassReportSubmission:
        """Flip Draft → Submitted. Idempotent: submitting an
        already-submitted report is a no-op that returns the same row."""
        exam = await _load_exam(session, school_id, exam_id)
        cls = await _load_class(session, school_id, class_id)
        await _assert_can_edit_draft(session, actor_role, actor_staff_id, cls)

        report = await ClassReportsRepository.find_report(session, exam_id=exam.id, class_id=cls.id)
        if report is None:
            # Create an empty submitted row so subsequent HOS-comment
            # patches work; matches the TS behaviour where submit
            # implicitly upserts.
            report = ClassReportSubmission(
                exam_id=_to_uuid(exam.id),
                class_id=_to_uuid(cls.id),
                status=CLASS_REPORT_SUBMITTED,
                submitted_by_id=(_to_uuid(actor_staff_id) if actor_staff_id else None),
                submitted_at=_now(),
                updated_at=_now(),
            )
            session.add(report)
            await session.flush()
            return report

        if report.status == CLASS_REPORT_SUBMITTED:
            return report

        report.status = CLASS_REPORT_SUBMITTED
        report.submitted_by_id = _to_uuid(actor_staff_id) if actor_staff_id else None
        report.submitted_at = _now()
        report.updated_at = _now()
        await session.flush()
        return report

    @staticmethod
    async def update_hos_comment(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        exam_id: UUID | str,
        class_id: UUID | str,
        hos_comment: str | None,
        actor_role: str,
        actor_staff_id: UUID | str | None,
        actor_user_id: UUID | str,
    ) -> ClassReportSubmission:
        """Deputy Head (own division) + Admin only. Writes one audit row
        capturing before/after."""
        exam = await _load_exam(session, school_id, exam_id)
        cls = await _load_class(session, school_id, class_id)
        await _assert_can_edit_hos_comment(session, school_id, actor_role, actor_staff_id, cls)

        report = await ClassReportsRepository.find_report(session, exam_id=exam.id, class_id=cls.id)
        if report is None:
            raise NotFoundError("Class report not found — teacher must draft/submit first.")

        before = report.head_of_school_comment
        after = hos_comment or None
        report.head_of_school_comment = after
        report.updated_at = _now()
        await session.flush()

        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=CLASS_REPORT_HOS_COMMENT_UPDATED,
            target_table="class_report_submissions",
            target_id=report.id,
            before={"hosComment": before},
            after={"hosComment": after},
        )
        return report


# ─── Internal helpers ───────────────────────────────────────────────────────


async def _load_exam(session: AsyncSession, school_id: UUID | str, exam_id: UUID | str) -> Exam:
    row = await ExamsRepository.get_by_id(session, school_id, exam_id)
    if not row:
        raise NotFoundError(f"Exam {exam_id!r} not found.")
    return row


async def _load_class(session: AsyncSession, school_id: UUID | str, class_id: UUID | str) -> Class:
    cls = await ClassesRepository.get_by_id(session, school_id, class_id)
    if not cls:
        raise NotFoundError(f"Class {class_id!r} not found.")
    return cls


async def _visible_class_ids(
    session: AsyncSession,
    school_id: UUID | str,
    actor_role: str,
    actor_staff_id: UUID | str | None,
) -> list[UUID] | None:
    """None = visible to everyone (Admin path). Empty list = no classes."""
    if actor_role == ADMIN:
        return None
    if actor_role == DEPUTY_HEAD:
        if not actor_staff_id:
            raise ForbiddenError("Deputy identity missing.")
        staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
        if not staff or not staff.division:
            raise ForbiddenError("Deputy Head has no assigned division.")
        stmt = select(Class.id).where(
            and_(Class.school_id == school_id, Class.division == staff.division)
        )
        return list((await session.execute(stmt)).scalars().all())
    if actor_role == TEACHER:
        if not actor_staff_id:
            raise ForbiddenError("Teacher identity missing.")
        return await ClassReportsRepository.classes_taught_by(
            session, school_id=school_id, staff_id=actor_staff_id
        )
    raise ForbiddenError("This role cannot view class reports.")


async def _assert_can_view_class(
    session: AsyncSession,
    school_id: UUID | str,
    actor_role: str,
    actor_staff_id: UUID | str | None,
    cls: Class,
) -> None:
    if actor_role == ADMIN:
        return
    if actor_role == DEPUTY_HEAD:
        if not actor_staff_id:
            raise ForbiddenError("Deputy identity missing.")
        staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
        if not staff or staff.division != cls.division:
            raise ForbiddenError("Deputy Head can only view own-division classes.")
        return
    if actor_role == TEACHER:
        if not actor_staff_id:
            raise ForbiddenError("Teacher identity missing.")
        owns = await ClassReportsRepository.is_class_teacher(
            session, staff_id=actor_staff_id, class_id=cls.id
        )
        if not owns:
            raise ForbiddenError("You aren't a class teacher for this class.")
        return
    raise ForbiddenError("This role cannot view class reports.")


async def _assert_can_edit_draft(
    session: AsyncSession,
    actor_role: str,
    actor_staff_id: UUID | str | None,
    cls: Class,
) -> None:
    """Class teacher only (Admin is not the primary target; matches TS
    intent where a class teacher owns their draft). Kept strict —
    Admin fixes go through the HOS PATCH after submit if needed."""
    if actor_role != TEACHER:
        raise ForbiddenError("Only the class teacher can save/submit this report.")
    if not actor_staff_id:
        raise ForbiddenError("Teacher identity missing.")
    owns = await ClassReportsRepository.is_class_teacher(
        session, staff_id=actor_staff_id, class_id=cls.id
    )
    if not owns:
        raise ForbiddenError("You aren't a class teacher for this class.")


async def _assert_can_edit_hos_comment(
    session: AsyncSession,
    school_id: UUID | str,
    actor_role: str,
    actor_staff_id: UUID | str | None,
    cls: Class,
) -> None:
    if actor_role == ADMIN:
        return
    if actor_role != DEPUTY_HEAD:
        raise ForbiddenError("Only Admin or Deputy Head can edit the HOS comment.")
    if not actor_staff_id:
        raise ForbiddenError("Deputy identity missing.")
    staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
    if not staff or staff.division != cls.division:
        raise ForbiddenError("Deputy Head can only comment on own-division classes.")
