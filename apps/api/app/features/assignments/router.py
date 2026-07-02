"""HTTP routes for assignments.

  GET    /assignments                     → paged list
  GET    /assignments/{id}                → fetch
  POST   /assignments                     → create (Teacher, uses linked_id)
  PATCH  /assignments/{id}                → edit (owning teacher)
  POST   /assignments/{id}/publish        → publish (owning teacher)
  POST   /assignments/{id}/unpublish      → unpublish (owning teacher)
  DELETE /assignments/{id}                → soft delete (owning teacher)

Read scoping:
  * Teacher — defaults to own; explicit `teacherId` ignored (can't
    peek at another teacher's list).
  * Admin / DeputyHead — all assignments in the school; can narrow
    with `teacherId`.
  * Parent — must pass `forStudentIds=uuid,uuid,…`. Server verifies
    each student is linked to the caller via `student_guardians`, then
    returns published assignments for those students' active classes.
    A parent request without `forStudentIds` is a 400.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT
from app.features.assignments.constants import AssignmentStatus
from app.features.assignments.model import Assignment
from app.features.assignments.schema import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentsListResponse,
    AssignmentUpdate,
)
from app.features.assignments.service import AssignmentsService
from app.features.classes.model import Class
from app.features.schools.service import SchoolsService
from app.features.staff.model import Staff
from app.features.students.model import StudentGuardian
from app.features.subjects.model import Subject

router = APIRouter(prefix="/assignments", tags=["assignments"])

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})


def _to_read(
    assignment: Assignment,
    teacher: Staff,
    subject: Subject,
    cls: Class,
) -> AssignmentRead:
    return AssignmentRead(
        id=assignment.id,
        school_id=assignment.school_id,
        teacher_id=assignment.teacher_id,
        teacher_first_name=teacher.first_name,
        teacher_last_name=teacher.last_name,
        subject_id=subject.id,
        subject_slug=subject.slug,
        subject_name=subject.name,
        class_id=cls.id,
        class_name=cls.name,
        division=cls.division,
        title=assignment.title,
        description=assignment.description,
        file_url=assignment.file_url,
        due_date=assignment.due_date,
        status=assignment.status,
        published_at=assignment.published_at,
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )


async def _verify_parent_student_ids(
    session: AsyncSession,
    *,
    guardian_id: UUID | str,
    student_ids: list[UUID],
) -> None:
    """A Parent must own every student ID they filter on. One SELECT +
    set-diff is cheaper than N per-row checks and matches the pattern
    the TS side uses (`inArray(studentIds)`)."""
    rows = (
        await session.execute(
            select(StudentGuardian.student_id).where(
                and_(
                    StudentGuardian.guardian_id == guardian_id,
                    StudentGuardian.student_id.in_(student_ids),
                )
            )
        )
    ).all()
    owned = {r[0] for r in rows}
    if owned != set(student_ids):
        raise ForbiddenError("You may only view assignments for your own children.")


@router.get("", response_model=AssignmentsListResponse, response_model_by_alias=True)
async def list_assignments(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    teacher_id: Annotated[UUID | None, Query(alias="teacherId")] = None,
    status_: Annotated[AssignmentStatus | None, Query(alias="status")] = None,
    class_id: Annotated[UUID | None, Query(alias="classId")] = None,
    for_student_ids: Annotated[list[UUID] | None, Query(alias="forStudentIds")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AssignmentsListResponse:
    """Read semantics:
    * Parent → `for_student_ids` required, ownership verified,
      `list_published_for_students` used.
    * Non-approver staff → forced to own `teacher_id`.
    * Approver → whatever they ask for.
    """
    if user.role == PARENT:
        if not for_student_ids:
            raise ValidationError("Parents must pass `forStudentIds`.")
        if not user.linked_id:
            raise ForbiddenError("Parent identity missing.")
        await _verify_parent_student_ids(
            session, guardian_id=user.linked_id, student_ids=for_student_ids
        )
        school = await SchoolsService.get(session, school_id)
        rows, total = await AssignmentsService.list_published_for_students(
            session,
            school_id,
            student_ids=list(for_student_ids),
            academic_year=school.academic_year,
            page=page,
            size=size,
        )
        return AssignmentsListResponse(
            items=[_to_read(a, t, s, c) for (a, t, s, c) in rows],
            total=total,
            page=page,
            size=size,
        )

    effective_teacher_id = teacher_id
    if user.role not in _APPROVER_ROLES:
        effective_teacher_id = UUID(user.linked_id) if user.linked_id else None

    rows, total = await AssignmentsService.list_for_school(
        session,
        school_id,
        teacher_id=effective_teacher_id,
        status=status_,
        class_id=class_id,
        page=page,
        size=size,
    )
    return AssignmentsListResponse(
        items=[_to_read(a, t, s, c) for (a, t, s, c) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{assignment_id}", response_model=AssignmentRead, response_model_by_alias=True)
async def get_assignment(
    assignment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AssignmentRead:
    """Owning teachers + Admin/Deputy can read directly. Parents fetch
    via the list endpoint (with ownership verification); we don't
    expose per-id reads for parents to avoid an IDOR footgun."""
    assignment, teacher, subject, cls = await AssignmentsService.get(
        session, school_id, assignment_id
    )
    if user.role in _APPROVER_ROLES:
        return _to_read(assignment, teacher, subject, cls)
    if user.linked_id and str(user.linked_id) == str(assignment.teacher_id):
        return _to_read(assignment, teacher, subject, cls)
    raise ForbiddenError("You may only view your own assignments.")


@router.post(
    "",
    response_model=AssignmentRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_assignment(
    payload: AssignmentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AssignmentRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot create an assignment without a staff identity.")
    assignment, teacher, subject, cls = await AssignmentsService.create(
        session, school_id, payload, teacher_id=user.linked_id
    )
    return _to_read(assignment, teacher, subject, cls)


@router.patch("/{assignment_id}", response_model=AssignmentRead, response_model_by_alias=True)
async def update_assignment(
    assignment_id: UUID,
    payload: AssignmentUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AssignmentRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot edit an assignment without a staff identity.")
    assignment, teacher, subject, cls = await AssignmentsService.update(
        session, school_id, assignment_id, payload, actor_staff_id=user.linked_id
    )
    return _to_read(assignment, teacher, subject, cls)


@router.post(
    "/{assignment_id}/publish",
    response_model=AssignmentRead,
    response_model_by_alias=True,
)
async def publish_assignment(
    assignment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AssignmentRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot publish an assignment without a staff identity.")
    assignment, teacher, subject, cls = await AssignmentsService.publish(
        session, school_id, assignment_id, actor_staff_id=user.linked_id
    )
    return _to_read(assignment, teacher, subject, cls)


@router.post(
    "/{assignment_id}/unpublish",
    response_model=AssignmentRead,
    response_model_by_alias=True,
)
async def unpublish_assignment(
    assignment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AssignmentRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot unpublish an assignment without a staff identity.")
    assignment, teacher, subject, cls = await AssignmentsService.unpublish(
        session, school_id, assignment_id, actor_staff_id=user.linked_id
    )
    return _to_read(assignment, teacher, subject, cls)


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_assignment(
    assignment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    if not user.linked_id:
        raise ForbiddenError("Cannot delete an assignment without a staff identity.")
    await AssignmentsService.soft_delete(
        session, school_id, assignment_id, actor_staff_id=user.linked_id
    )
