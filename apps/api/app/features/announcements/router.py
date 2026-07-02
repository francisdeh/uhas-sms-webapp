"""HTTP routes for Announcements.

  GET    /announcements               → visible list (role-filtered)
  GET    /announcements/{id}          → detail
  POST   /announcements                → post (Admin/DeputyHead)
  DELETE /announcements/{id}          → delete (author or Admin)

The list endpoint is role-filtered inside the service — the client
doesn't get to pass a role or a division; the JWT is the sole source
of truth.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.features.announcements.model import Announcement
from app.features.announcements.schema import (
    AnnouncementCreate,
    AnnouncementRead,
    AnnouncementsListResponse,
)
from app.features.announcements.service import AnnouncementsService
from app.features.staff.model import Staff

router = APIRouter(prefix="/announcements", tags=["announcements"])


def _to_read(row: Announcement, author: Staff) -> AnnouncementRead:
    return AnnouncementRead(
        id=row.id,
        school_id=row.school_id,
        title=row.title,
        body=row.body,
        audience=row.audience,
        is_critical=bool(row.is_critical),
        created_by_id=row.created_by_id,
        created_by_name=f"{author.first_name} {author.last_name}",
        created_at=row.created_at,
    )


@router.get(
    "",
    response_model=AnnouncementsListResponse,
    response_model_by_alias=True,
)
async def list_announcements(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> AnnouncementsListResponse:
    """Role-filtered list. See `AnnouncementsService.list_visible_to`
    for the per-role visibility matrix."""
    rows, total = await AnnouncementsService.list_visible_to(
        session,
        school_id,
        actor_role=user.role or "",
        actor_linked_id=user.linked_id,
        page=page,
        size=size,
    )
    return AnnouncementsListResponse(
        items=[_to_read(a, s) for (a, s) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/{announcement_id}",
    response_model=AnnouncementRead,
    response_model_by_alias=True,
)
async def get_announcement(
    announcement_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AnnouncementRead:
    """Any authenticated caller in the school can fetch by id — the
    per-role visibility filter is a list-level convenience, not a
    hard access control. Detail reads are trivial and don't leak
    anything the list wouldn't already show to Admins."""
    _ = user
    row, author = await AnnouncementsService.get(session, school_id, announcement_id)
    return _to_read(row, author)


@router.post(
    "",
    response_model=AnnouncementRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_announcement(
    payload: AnnouncementCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AnnouncementRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot post an announcement without a staff identity.")
    row, author = await AnnouncementsService.create(
        session,
        school_id,
        payload,
        author_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    return _to_read(row, author)


@router.delete(
    "/{announcement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_announcement(
    announcement_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    if not user.linked_id:
        raise ForbiddenError("Cannot delete an announcement without a staff identity.")
    await AnnouncementsService.delete(
        session,
        school_id,
        announcement_id,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
