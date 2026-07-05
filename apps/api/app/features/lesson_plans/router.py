"""HTTP routes for lesson plans.

  GET    /lesson-plans                            → paged list
  GET    /lesson-plans/{id}                       → fetch
  POST   /lesson-plans                            → create (Teacher, uses linked_id)
  PATCH  /lesson-plans/{id}                       → edit (owning teacher, draft/rejected only)
  POST   /lesson-plans/{id}/submit                → submit (owner, draft/rejected only)
  POST   /lesson-plans/{id}/review                → approve/reject (Unit Head / Deputy / Admin)
  DELETE /lesson-plans/{id}                       → soft delete (owner, draft/rejected only)

Teacher-list read semantics: without `?teacherId=`, callers see all
plans for their school (Admin + Deputy queue view). A non-Admin/Deputy
gets defaulted to their own `linked_id` — mirrors the pattern in
leave requests.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.core.roles import ADMIN, DEPUTY_HEAD
from app.features.classes.model import Class
from app.features.lesson_plans.constants import LessonPlanStatus
from app.features.lesson_plans.model import LessonPlan
from app.features.lesson_plans.schema import (
    LessonPlanCreate,
    LessonPlanRead,
    LessonPlanReviewRequest,
    LessonPlansListResponse,
    LessonPlanUpdate,
)
from app.features.lesson_plans.service import LessonPlansService
from app.features.staff.model import Staff
from app.features.subjects.model import Subject

router = APIRouter(prefix="/lesson-plans", tags=["lesson-plans"])

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})


def _to_read(
    plan: LessonPlan,
    teacher: Staff,
    subject: Subject,
    cls: Class,
    latest_reviewer: Staff | None,
    latest_comment: str | None,
    latest_reviewed_at: object | None,
) -> LessonPlanRead:
    """External shape preserved.

    The `reviewer_*` fields are now populated from the
    `lesson_plan_reviews` child table's latest row (the repository does
    the join), not from stale columns on `lesson_plans`. The full-history
    endpoint is a followup — see [docs/MIGRATION-CLEANUP.md] §Backlog.
    """
    return LessonPlanRead(
        id=plan.id,
        school_id=plan.school_id,
        teacher_id=plan.teacher_id,
        teacher_first_name=teacher.first_name,
        teacher_last_name=teacher.last_name,
        subject_id=subject.id,
        subject_slug=subject.slug,
        subject_name=subject.name,
        class_id=cls.id,
        class_name=cls.name,
        division=cls.division,
        term=plan.term,
        week=plan.week,
        topic=plan.topic,
        learning_objectives=plan.learning_objectives,
        teaching_methods=plan.teaching_methods,
        resources=plan.resources,
        assessment_plan=plan.assessment_plan,
        file_url=plan.file_url,
        status=plan.status,
        reviewer_comment=latest_comment,
        reviewed_by_id=latest_reviewer.id if latest_reviewer else None,
        reviewed_by_name=(
            f"{latest_reviewer.first_name} {latest_reviewer.last_name}" if latest_reviewer else None
        ),
        reviewed_at=latest_reviewed_at,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.get("", response_model=LessonPlansListResponse, response_model_by_alias=True)
async def list_lesson_plans(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    teacher_id: Annotated[UUID | None, Query(alias="teacherId")] = None,
    status_: Annotated[LessonPlanStatus | None, Query(alias="status")] = None,
    division: Annotated[str | None, Query()] = None,
    class_id: Annotated[UUID | None, Query(alias="classId")] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # Review-queue and "my plans" views fetch up to 200 in one page
    # rather than paginating a per-teacher/per-division list.
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> LessonPlansListResponse:
    """Non-Admin/Deputy default to own plans only. Reviewers see everyone
    unless they narrow with `?teacherId=`."""
    effective_teacher_id = teacher_id
    if user.role not in _APPROVER_ROLES:
        effective_teacher_id = UUID(user.linked_id) if user.linked_id else None

    rows, total = await LessonPlansService.list_for_school(
        session,
        school_id,
        teacher_id=effective_teacher_id,
        status=status_,
        division=division,
        class_id=class_id,
        term=term,
        page=page,
        size=size,
    )
    return LessonPlansListResponse(
        items=[_to_read(lp, t, s, c, r, cm, ts) for (lp, t, s, c, r, cm, ts) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{plan_id}", response_model=LessonPlanRead, response_model_by_alias=True)
async def get_lesson_plan(
    plan_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LessonPlanRead:
    """Owning teachers + approvers can read. Anyone else 403s.

    Same IDOR guard we applied to leave requests — a Parent iterating
    UUIDs can't peek at teacher lesson plans.
    """
    plan, teacher, subject, cls, reviewer, comment, reviewed_at = await LessonPlansService.get(
        session, school_id, plan_id
    )
    if user.role not in _APPROVER_ROLES and (
        not user.linked_id or str(user.linked_id) != str(plan.teacher_id)
    ):
        raise ForbiddenError("You may only view your own lesson plans.")
    return _to_read(plan, teacher, subject, cls, reviewer, comment, reviewed_at)


@router.post(
    "",
    response_model=LessonPlanRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_lesson_plan(
    payload: LessonPlanCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LessonPlanRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot create a lesson plan without a staff identity.")
    plan, teacher, subject, cls, reviewer, comment, reviewed_at = await LessonPlansService.create(
        session, school_id, payload, teacher_id=user.linked_id
    )
    return _to_read(plan, teacher, subject, cls, reviewer, comment, reviewed_at)


@router.patch("/{plan_id}", response_model=LessonPlanRead, response_model_by_alias=True)
async def update_lesson_plan(
    plan_id: UUID,
    payload: LessonPlanUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LessonPlanRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot edit a lesson plan without a staff identity.")
    plan, teacher, subject, cls, reviewer, comment, reviewed_at = await LessonPlansService.update(
        session, school_id, plan_id, payload, actor_staff_id=user.linked_id
    )
    return _to_read(plan, teacher, subject, cls, reviewer, comment, reviewed_at)


@router.post(
    "/{plan_id}/submit",
    response_model=LessonPlanRead,
    response_model_by_alias=True,
)
async def submit_lesson_plan(
    plan_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LessonPlanRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot submit a lesson plan without a staff identity.")
    plan, teacher, subject, cls, reviewer, comment, reviewed_at = await LessonPlansService.submit(
        session, school_id, plan_id, actor_staff_id=user.linked_id
    )
    return _to_read(plan, teacher, subject, cls, reviewer, comment, reviewed_at)


@router.post(
    "/{plan_id}/review",
    response_model=LessonPlanRead,
    response_model_by_alias=True,
)
async def review_lesson_plan(
    plan_id: UUID,
    payload: LessonPlanReviewRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> LessonPlanRead:
    actor_role = user.role or ""
    plan, teacher, subject, cls, reviewer, comment, reviewed_at = await LessonPlansService.review(
        session,
        school_id,
        plan_id,
        payload,
        actor_staff_id=user.linked_id,
        actor_role=actor_role,
    )
    return _to_read(plan, teacher, subject, cls, reviewer, comment, reviewed_at)


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_lesson_plan(
    plan_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    if not user.linked_id:
        raise ForbiddenError("Cannot delete a lesson plan without a staff identity.")
    await LessonPlansService.soft_delete(session, school_id, plan_id, actor_staff_id=user.linked_id)
