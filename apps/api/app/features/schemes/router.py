"""HTTP routes for schemes.

GET    /schemes                           → paged list
GET    /schemes/{id}                      → fetch
POST   /schemes                           → create (Teacher, uses linked_id)
PATCH  /schemes/{id}                      → edit (owning teacher, draft only)
POST   /schemes/{id}/submit               → submit (owning teacher, draft only)
POST   /schemes/{id}/acknowledge          → acknowledge (Unit Head/Deputy/Admin)
POST   /schemes/{id}/comments             → add to thread (author or reviewer)
DELETE /schemes/{id}                      → soft delete (owning teacher, draft only)
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
from app.features.schemes.constants import SchemeStatus
from app.features.schemes.model import Scheme, SchemeComment
from app.features.schemes.schema import (
    SchemeAcknowledgeRequest,
    SchemeCommentRead,
    SchemeCommentRequest,
    SchemeCreate,
    SchemeRead,
    SchemesListResponse,
    SchemeUpdate,
)
from app.features.schemes.service import SchemesService
from app.features.staff.model import Staff
from app.features.subjects.model import Subject

router = APIRouter(prefix="/schemes", tags=["schemes"])

_APPROVER_ROLES: frozenset[str] = frozenset({ADMIN, DEPUTY_HEAD})


def _to_read(
    scheme: Scheme,
    teacher: Staff,
    subject: Subject,
    cls: Class,
    reviewer: Staff | None,
    comments: list[tuple[SchemeComment, Staff]] | None = None,
) -> SchemeRead:
    return SchemeRead(
        id=scheme.id,
        school_id=scheme.school_id,
        teacher_id=scheme.teacher_id,
        teacher_first_name=teacher.first_name,
        teacher_last_name=teacher.last_name,
        subject_id=subject.id,
        subject_slug=subject.slug,
        subject_name=subject.name,
        class_id=cls.id,
        class_name=cls.name,
        division=cls.division,
        type=scheme.type,
        term=scheme.term,
        academic_year=scheme.academic_year,
        title=scheme.title,
        file_url=scheme.file_url,
        content=scheme.content,
        status=scheme.status,
        reviewed_by_id=scheme.reviewed_by_id,
        reviewed_by_name=(f"{reviewer.first_name} {reviewer.last_name}" if reviewer else None),
        reviewed_at=scheme.reviewed_at,
        submitted_at=scheme.submitted_at,
        created_at=scheme.created_at,
        updated_at=scheme.updated_at,
        comments=[
            SchemeCommentRead(
                id=comment.id,
                author_id=comment.author_id,
                author_name=f"{author.first_name} {author.last_name}",
                body=comment.body,
                created_at=comment.created_at,
            )
            for comment, author in (comments or [])
        ],
    )


@router.get("", response_model=SchemesListResponse, response_model_by_alias=True)
async def list_schemes(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    teacher_id: Annotated[UUID | None, Query(alias="teacherId")] = None,
    status_: Annotated[SchemeStatus | None, Query(alias="status")] = None,
    division: Annotated[str | None, Query()] = None,
    term: Annotated[int | None, Query(ge=1, le=3)] = None,
    academic_year: Annotated[str | None, Query(alias="academicYear")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # A per-teacher "all my schemes" view fetches up to 200 in one page
    # rather than paginating.
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> SchemesListResponse:
    effective_teacher_id = teacher_id
    if user.role not in _APPROVER_ROLES:
        effective_teacher_id = UUID(user.linked_id) if user.linked_id else None

    rows, total = await SchemesService.list_for_school(
        session,
        school_id,
        teacher_id=effective_teacher_id,
        status=status_,
        division=division,
        term=term,
        academic_year=academic_year,
        page=page,
        size=size,
    )
    return SchemesListResponse(
        items=[_to_read(sc, t, s, c, r) for (sc, t, s, c, r) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{scheme_id}", response_model=SchemeRead, response_model_by_alias=True)
async def get_scheme(
    scheme_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    scheme, teacher, subject, cls, reviewer = await SchemesService.get(
        session, school_id, scheme_id
    )
    if user.role not in _APPROVER_ROLES and (
        not user.linked_id or str(user.linked_id) != str(scheme.teacher_id)
    ):
        raise ForbiddenError("You may only view your own schemes.")
    comments = await SchemesService.list_comments(session, scheme_id)
    return _to_read(scheme, teacher, subject, cls, reviewer, comments)


@router.post(
    "",
    response_model=SchemeRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_scheme(
    payload: SchemeCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot create a scheme without a staff identity.")
    scheme, teacher, subject, cls, reviewer = await SchemesService.create(
        session, school_id, payload, teacher_id=user.linked_id
    )
    return _to_read(scheme, teacher, subject, cls, reviewer)


@router.patch("/{scheme_id}", response_model=SchemeRead, response_model_by_alias=True)
async def update_scheme(
    scheme_id: UUID,
    payload: SchemeUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot edit a scheme without a staff identity.")
    scheme, teacher, subject, cls, reviewer = await SchemesService.update(
        session, school_id, scheme_id, payload, actor_staff_id=user.linked_id
    )
    return _to_read(scheme, teacher, subject, cls, reviewer)


@router.post(
    "/{scheme_id}/submit",
    response_model=SchemeRead,
    response_model_by_alias=True,
)
async def submit_scheme(
    scheme_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot submit a scheme without a staff identity.")
    scheme, teacher, subject, cls, reviewer = await SchemesService.submit(
        session, school_id, scheme_id, actor_staff_id=user.linked_id
    )
    return _to_read(scheme, teacher, subject, cls, reviewer)


@router.post(
    "/{scheme_id}/acknowledge",
    response_model=SchemeRead,
    response_model_by_alias=True,
)
async def acknowledge_scheme(
    scheme_id: UUID,
    payload: SchemeAcknowledgeRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    scheme, teacher, subject, cls, reviewer = await SchemesService.acknowledge(
        session,
        school_id,
        scheme_id,
        payload,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    comments = await SchemesService.list_comments(session, scheme_id)
    return _to_read(scheme, teacher, subject, cls, reviewer, comments)


@router.post(
    "/{scheme_id}/comments",
    response_model=SchemeRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def comment_on_scheme(
    scheme_id: UUID,
    payload: SchemeCommentRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchemeRead:
    scheme, teacher, subject, cls, reviewer = await SchemesService.add_comment(
        session,
        school_id,
        scheme_id,
        payload.body,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    comments = await SchemesService.list_comments(session, scheme_id)
    return _to_read(scheme, teacher, subject, cls, reviewer, comments)


@router.delete(
    "/{scheme_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_scheme(
    scheme_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    if not user.linked_id:
        raise ForbiddenError("Cannot delete a scheme without a staff identity.")
    await SchemesService.soft_delete(session, school_id, scheme_id, actor_staff_id=user.linked_id)
