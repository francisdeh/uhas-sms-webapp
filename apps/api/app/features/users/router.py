"""HTTP routes for admin user management.

All Admin-only:

  GET    /users                 → paginated list (server-side q filter)
  POST   /users                 → create Supabase auth user + bridge row
  PATCH  /users/{id}            → update email + display_name
  POST   /users/{id}/activate   → reactivate (Supabase ban_duration=none)
  POST   /users/{id}/deactivate → disable (Supabase ban_duration=876600h)
  POST   /users/{id}/reset-mfa  → clear the user's 2FA factors (lockout recovery)

Role/linked_id changes go through a distinct admin flow so audit-log
entries can track them separately from name/email edits.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.audit.actions import USER_DEACTIVATED, USER_REACTIVATED
from app.features.users.schema import (
    MfaResetResponse,
    UserCreate,
    UserRead,
    UsersListResponse,
    UserUpdate,
)
from app.features.users.service import UsersService
from app.features.users.supabase_admin import (
    SupabaseAdminClient,
    get_supabase_admin_client,
)

router = APIRouter(prefix="/users", tags=["users"])

_SupabaseDep = Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)]


@router.get("", response_model=UsersListResponse, response_model_by_alias=True)
async def list_users(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: RequireAdmin,
    q: Annotated[str | None, Query(description="Match email or display_name")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # One row per staff/guardian account — bounded by school size like
    # classes/staff. The Admin Users page fetches "everyone" in one page.
    size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> UsersListResponse:
    items, total = await UsersService.list_for_school(session, school_id, q=q, page=page, size=size)
    return UsersListResponse(items=items, total=total, page=page, size=size)


@router.post(
    "",
    response_model=UserRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    admin: RequireAdmin,
    supabase: _SupabaseDep,
) -> UserRead:
    return await UsersService.create(
        session, school_id, payload, supabase=supabase, actor_user_id=admin.user_id
    )


@router.patch("/{user_id}", response_model=UserRead, response_model_by_alias=True)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    _admin: RequireAdmin,
    supabase: _SupabaseDep,
) -> UserRead:
    return await UsersService.update(session, school_id, user_id, payload, supabase=supabase)


@router.post(
    "/{user_id}/deactivate",
    response_model=UserRead,
    response_model_by_alias=True,
)
async def deactivate_user(
    user_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    admin: RequireAdmin,
    supabase: _SupabaseDep,
) -> UserRead:
    return await UsersService.set_active(
        session,
        school_id,
        user_id,
        active=False,
        supabase=supabase,
        actor_user_id=admin.user_id,
        action=USER_DEACTIVATED,
    )


@router.post(
    "/{user_id}/activate",
    response_model=UserRead,
    response_model_by_alias=True,
)
async def activate_user(
    user_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    admin: RequireAdmin,
    supabase: _SupabaseDep,
) -> UserRead:
    return await UsersService.set_active(
        session,
        school_id,
        user_id,
        active=True,
        supabase=supabase,
        actor_user_id=admin.user_id,
        action=USER_REACTIVATED,
    )


@router.post(
    "/{user_id}/reset-mfa",
    response_model=MfaResetResponse,
    response_model_by_alias=True,
)
async def reset_user_mfa(
    user_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    admin: RequireAdmin,
    supabase: _SupabaseDep,
) -> MfaResetResponse:
    """Clear a user's 2FA factors — lockout recovery for a lost
    authenticator (Supabase has no backup codes). Admin-only."""
    removed = await UsersService.reset_mfa(
        session,
        school_id,
        user_id,
        supabase=supabase,
        actor_user_id=admin.user_id,
    )
    return MfaResetResponse(factors_removed=removed)
