"""Business logic for Lesson Plans — state machine + reviewer auth.

State machine (transitions in `_ALLOWED_TRANSITIONS`):
  draft            → submitted, (deleted)
  submitted        → unit_head_approved, rejected, approved (Deputy can skip Unit Head)
  unit_head_approved → approved, rejected
  approved         → (terminal)
  rejected         → draft (implicit on any teacher edit)

Reviewer authorisation:
  Unit Head review (submitted → unit_head_approved | rejected):
    Admin, DeputyHead (any division), OR Teacher with
    `is_unit_head=True` AND `unit_head_of == class.division`
  Deputy Head review (unit_head_approved → approved | rejected):
    Admin, DeputyHead — division match required for DeputyHead
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.lesson_plans.constants import (
    APPROVED,
    DRAFT,
    REJECTED,
    SUBMITTED,
    UNIT_HEAD_APPROVED,
)
from app.features.lesson_plans.model import LessonPlan
from app.features.lesson_plans.repository import LessonPlansRepository
from app.features.lesson_plans.schema import (
    LessonPlanCreate,
    LessonPlanReviewRequest,
    LessonPlanUpdate,
)
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository

_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    DRAFT: {SUBMITTED},
    SUBMITTED: {UNIT_HEAD_APPROVED, APPROVED, REJECTED},
    UNIT_HEAD_APPROVED: {APPROVED, REJECTED},
    APPROVED: set(),
    REJECTED: {DRAFT},
}


def _now() -> datetime:
    """`reviewed_at` / `updated_at` columns are TIMESTAMP WITHOUT TIME ZONE;
    strip tz to keep asyncpg happy (same convention we used in exams)."""
    return datetime.now(UTC).replace(tzinfo=None)


class LessonPlansService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        division: str | None = None,
        class_id: UUID | str | None = None,
        term: int | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[
        list[
            tuple[
                LessonPlan,
                Staff,
                Subject,
                Class,
                Staff | None,
                str | None,
                object | None,
            ]
        ],
        int,
    ]:
        return await LessonPlansRepository.list_for_school(
            session,
            school_id,
            teacher_id=teacher_id,
            status=status,
            division=division,
            class_id=class_id,
            term=term,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, plan_id: UUID | str
    ) -> tuple[
        LessonPlan,
        Staff,
        Subject,
        Class,
        Staff | None,
        str | None,
        object | None,
    ]:
        row = await LessonPlansRepository.get_by_id(session, school_id, plan_id)
        if not row:
            raise NotFoundError(f"Lesson plan {plan_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: LessonPlanCreate,
        *,
        teacher_id: UUID | str,
    ) -> tuple[
        LessonPlan,
        Staff,
        Subject,
        Class,
        Staff | None,
        str | None,
        object | None,
    ]:
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        subject = await SubjectsRepository.get_by_id(session, school_id, payload.subject_id)
        if not subject:
            raise ValidationError("Subject not found in this school.")

        row = LessonPlan(
            school_id=school_id,
            teacher_id=teacher_id,
            subject_id=payload.subject_id,
            class_id=payload.class_id,
            term=payload.term,
            week=payload.week,
            topic=payload.topic,
            learning_objectives=payload.learning_objectives,
            teaching_methods=payload.teaching_methods,
            resources=payload.resources,
            assessment_plan=payload.assessment_plan,
            file_url=payload.file_url,
            status=DRAFT,
        )
        session.add(row)
        await session.flush()
        return await LessonPlansService.get(session, school_id, row.id)

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        plan_id: UUID | str,
        payload: LessonPlanUpdate,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[
        LessonPlan,
        Staff,
        Subject,
        Class,
        Staff | None,
        str | None,
        object | None,
    ]:
        """Edit — only allowed for the owning teacher, only in draft or
        rejected state. A rejected-plan edit implicitly moves it back
        to draft (matches the TS behaviour).

        The reviewer stamp on the response is now derived from the
        `lesson_plan_reviews` table — the row itself no longer carries
        review fields — so a rejected → draft flip just changes status;
        the review-history join keeps showing the last rejection until a
        new review appends. That's fine: once the plan is in `draft`,
        the frontend doesn't render the reviewer badge anyway.
        """
        row, _teacher, _sub, _cls, _rev, _c, _ts = await LessonPlansService.get(
            session, school_id, plan_id
        )
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can edit this lesson plan.")
        if row.status not in {DRAFT, REJECTED}:
            raise ConflictError(f"Cannot edit a lesson plan in {row.status!r} state.")

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        if row.status == REJECTED:
            row.status = DRAFT
        row.updated_at = _now()
        await session.flush()
        return await LessonPlansService.get(session, school_id, plan_id)

    @staticmethod
    async def submit(
        session: AsyncSession,
        school_id: UUID | str,
        plan_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[
        LessonPlan,
        Staff,
        Subject,
        Class,
        Staff | None,
        str | None,
        object | None,
    ]:
        row, _t, _s, _c, _r, _cm, _ts = await LessonPlansService.get(session, school_id, plan_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can submit this lesson plan.")
        if SUBMITTED not in _ALLOWED_TRANSITIONS.get(row.status, set()):
            raise ConflictError(f"Cannot submit a lesson plan in {row.status!r} state.")
        row.status = SUBMITTED
        row.updated_at = _now()
        await session.flush()
        return await LessonPlansService.get(session, school_id, plan_id)

    @staticmethod
    async def review(
        session: AsyncSession,
        school_id: UUID | str,
        plan_id: UUID | str,
        payload: LessonPlanReviewRequest,
        *,
        actor_staff_id: UUID | str | None,
        actor_role: str,
    ) -> tuple[
        LessonPlan,
        Staff,
        Subject,
        Class,
        Staff | None,
        str | None,
        object | None,
    ]:
        """Approve or reject. Reviewer auth is inferred from the *plan's*
        current status + the caller's role + (for Unit Heads) the class's
        division."""
        row, _teacher, _sub, cls, _rev, _cm, _ts = await LessonPlansService.get(
            session, school_id, plan_id
        )
        decision = payload.decision

        if decision not in _ALLOWED_TRANSITIONS.get(row.status, set()):
            raise ValidationError(f"Cannot transition from {row.status!r} to {decision!r}.")
        if decision == DRAFT:
            raise ValidationError("Cannot 'review' a plan back to draft.")

        await _assert_can_review(
            session,
            school_id,
            from_status=row.status,
            to_status=decision,
            actor_staff_id=actor_staff_id,
            actor_role=actor_role,
            class_division=cls.division,
        )

        if not actor_staff_id:
            raise ForbiddenError("A staff identity is required to record a review.")

        # Append a new review row instead of overwriting a single-column
        # snapshot. `insert_review` handles the FK + created_at defaults.
        await LessonPlansRepository.insert_review(
            session,
            lesson_plan_id=row.id,
            reviewer_id=actor_staff_id,
            decision=decision,
            comment=payload.comment,
        )
        row.status = decision
        row.updated_at = _now()
        await session.flush()
        # NOTE: notification triggers fire here in the TS side —
        # teacher on approve/reject, next-tier reviewer on advance.
        # Deferred to Phase 2 #9 (Notifications port). See
        # docs/MIGRATION-CLEANUP.md for the exact triggers.
        return await LessonPlansService.get(session, school_id, plan_id)

    @staticmethod
    async def soft_delete(
        session: AsyncSession,
        school_id: UUID | str,
        plan_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> None:
        """Only the owning teacher, only while draft/rejected. Sets
        `deleted_at`; the row stays for audit."""
        row, _t, _s, _c, _r, _cm, _ts = await LessonPlansService.get(session, school_id, plan_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can delete this lesson plan.")
        if row.status not in {DRAFT, REJECTED}:
            raise ConflictError(f"Cannot delete a lesson plan in {row.status!r} state.")
        row.deleted_at = _now()
        await session.flush()


async def _assert_can_review(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    from_status: str,
    to_status: str,
    actor_staff_id: UUID | str | None,
    actor_role: str,
    class_division: str,
) -> None:
    """Enforce the reviewer-auth matrix.

    - Unit Head step (submitted → unit_head_approved | rejected):
      Admin, DeputyHead (any division), or Teacher-Unit-Head of the
      class's division.
    - Deputy Head step (submitted → approved OR unit_head_approved → *):
      Admin or DeputyHead. DeputyHead only for their own division.
    """
    if actor_role == ADMIN:
        return

    if from_status == SUBMITTED and to_status in {UNIT_HEAD_APPROVED, REJECTED}:
        # Unit Head step — check DeputyHead OR Teacher-Unit-Head-of-division.
        if actor_role == DEPUTY_HEAD:
            return
        if actor_role == TEACHER and actor_staff_id:
            staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
            if staff and staff.is_unit_head and staff.unit_head_of == class_division:
                return
        raise ForbiddenError("Only a Unit Head, Deputy Head, or Admin can review.")

    # Deputy Head step: SUBMITTED→APPROVED, UNIT_HEAD_APPROVED→APPROVED,
    # or UNIT_HEAD_APPROVED→REJECTED.
    if actor_role == DEPUTY_HEAD:
        # DeputyHead is scoped to their own division. The audit-log
        # side stamps the class division; the JWT stamps the staff's
        # `division`. Enforce match.
        if actor_staff_id:
            staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
            if staff and staff.division == class_division:
                return
        raise ForbiddenError("Deputy Head can only review plans in their own division.")

    raise ForbiddenError("Only Deputy Head or Admin can complete the second review.")
