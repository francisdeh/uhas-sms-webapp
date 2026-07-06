"""HTTP routes for the session-user endpoint.

    GET   /me   →  MeRead (any authenticated user)
    PATCH /me   →  MeRead — self-service displayName/phone update

Called on every dashboard render by the Next-side `getSessionUser()`
helper — this endpoint replaces the Drizzle join across users/staff/
guardians and lets the web app stay Drizzle-free.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentUserDep
from app.features.me.schema import MeRead, MeUpdate
from app.features.me.service import MeService
from app.features.users.supabase_admin import SupabaseAdminClient, get_supabase_admin_client

router = APIRouter(prefix="/me", tags=["me"])


@router.get(
    "",
    response_model=MeRead,
    response_model_by_alias=True,
    summary="Fetch the caller's composite session profile",
)
async def get_me(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MeRead:
    """Return the current session's rich SessionUser shape.

    The web layer calls this on every dashboard render — one round-trip
    instead of three (`users` + `staff|guardians` + JWT decode). Fields
    match the legacy `SessionUser` TS type 1:1 so the display doesn't
    shift when the migration cuts over.
    """
    return await MeService.get(session, user)


@router.patch(
    "",
    response_model=MeRead,
    response_model_by_alias=True,
    summary="Update the caller's own display name and/or phone",
)
async def update_me(
    payload: MeUpdate,
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> MeRead:
    return await MeService.update(session, user, payload, supabase=supabase)


@router.post(
    "/deactivate",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Deactivate the caller's own account (non-Admin only)",
)
async def deactivate_me(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> None:
    """Self-service account deactivation. Bans the caller's Supabase
    auth user + flips `users.is_active`, so they're logged out on the
    next token refresh; the web client also signs them out immediately.
    Admins get 403 (see `MeService.deactivate`)."""
    await MeService.deactivate(session, user, supabase=supabase)
