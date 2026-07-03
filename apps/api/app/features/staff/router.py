"""HTTP routes for the Staff domain.

Six endpoints — one for each Admin UI action:

  GET    /staff              → paginated list (server-side q + cursor)
  GET    /staff/{id}         → fetch single
  POST   /staff              → create
  PATCH  /staff/{id}         → partial update
  PATCH  /staff/{id}/role    → role change (audit-logged)
  PATCH  /staff/{id}/unit-head → toggle unit-head flag
  POST   /staff/{id}/activate   → reactivate
  POST   /staff/{id}/deactivate → deactivate

All writes require `Admin`, except `PATCH /staff/{id}` — non-Admin staff
can patch `photo_url` on their own row so the profile page can update
avatars without a separate endpoint. Reads are open to any authenticated
user; several pages (lesson plan reviewer list, class-teacher dropdown)
need to see staff names.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.features.staff.schema import (
    StaffCreate,
    StaffListResponse,
    StaffRead,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
)
from app.features.staff.service import StaffService

router = APIRouter(prefix="/staff", tags=["staff"])


@router.get("", response_model=StaffListResponse, response_model_by_alias=True)
async def list_staff(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query(description="Search across name + email + UHAS ID")] = None,
    page: Annotated[int, Query(ge=1, description="1-based page index")] = 1,
    size: Annotated[int, Query(ge=1, le=100, description="Rows per page")] = 50,
    active_only: Annotated[bool, Query(alias="activeOnly")] = False,
) -> StaffListResponse:
    rows, total = await StaffService.list_for_school(
        session,
        school_id,
        q=q,
        page=page,
        size=size,
        active_only=active_only,
    )
    return StaffListResponse(
        items=[StaffRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{staff_id}", response_model=StaffRead, response_model_by_alias=True)
async def get_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StaffRead:
    row = await StaffService.get(session, school_id, staff_id)
    return StaffRead.model_validate(row)


@router.post(
    "",
    response_model=StaffRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_staff(
    payload: StaffCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.create(session, school_id, payload)
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}", response_model=StaffRead, response_model_by_alias=True)
async def update_staff(
    staff_id: UUID,
    payload: StaffUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> StaffRead:
    row = await StaffService.update(session, school_id, staff_id, payload, user=user)
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}/role", response_model=StaffRead, response_model_by_alias=True)
async def change_role(
    staff_id: UUID,
    payload: StaffRoleChange,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.change_role(
        session, school_id, staff_id, payload, actor_user_id=user.user_id
    )
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}/unit-head", response_model=StaffRead, response_model_by_alias=True)
async def toggle_unit_head(
    staff_id: UUID,
    payload: StaffUnitHeadToggle,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.toggle_unit_head(session, school_id, staff_id, payload)
    return StaffRead.model_validate(row)


@router.post("/{staff_id}/activate", response_model=StaffRead, response_model_by_alias=True)
async def activate_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.set_active(session, school_id, staff_id, active=True)
    return StaffRead.model_validate(row)


@router.post("/{staff_id}/deactivate", response_model=StaffRead, response_model_by_alias=True)
async def deactivate_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.set_active(session, school_id, staff_id, active=False)
    return StaffRead.model_validate(row)
