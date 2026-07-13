"""HTTP routes for the session-user endpoint.

    GET   /me               →  MeRead (any authenticated user)
    PATCH /me                →  MeRead — self-service displayName update
    POST  /me/phone/confirm  →  MeRead — mirrors Supabase's already-
                                 OTP-confirmed phone into the linked row
    POST  /me/email/confirm  →  MeRead — mirrors Supabase's already-
                                 confirmed email into users.email +
                                 the linked row
    POST  /me/email/request-change → kicks off a branded dual-
                                 confirmation email change (replaces a
                                 direct client-side Supabase call)

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
from app.features.me.schema import EmailChangeRequest, MeRead, MeUpdate
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
    summary="Update the caller's own display name",
)
async def update_me(
    payload: MeUpdate,
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> MeRead:
    return await MeService.update(session, user, payload, supabase=supabase)


@router.post(
    "/phone/confirm",
    response_model=MeRead,
    response_model_by_alias=True,
    summary="Mirror an already Supabase-confirmed phone into the caller's profile",
)
async def confirm_me_phone(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> MeRead:
    """Call after the frontend completes Supabase's own phone-change OTP
    round trip (`updateUser({phone})` then `verifyOtp({type:
    "phone_change"})`). Takes no body — reads the now-confirmed phone
    straight back off Supabase Auth rather than trusting a client-
    supplied value."""
    return await MeService.confirm_phone(session, user, supabase=supabase)


@router.post(
    "/email/confirm",
    response_model=MeRead,
    response_model_by_alias=True,
    summary="Mirror an already Supabase-confirmed email into the caller's profile",
)
async def confirm_me_email(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> MeRead:
    """Call after the frontend's `updateUser({email})`. Unlike phone,
    Supabase confirms an email change via a link the user clicks in
    their inbox, not an inline code — safe to call any time (e.g. on
    every profile-page load) since it just mirrors whatever Supabase
    currently has confirmed; a no-op if nothing changed."""
    return await MeService.confirm_email(session, user, supabase=supabase)


@router.post(
    "/email/request-change",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request an email change — sends our own branded dual-confirmation emails",
)
async def request_me_email_change(
    payload: EmailChangeRequest,
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)],
) -> None:
    """Replaces the frontend's direct `supabase.auth.updateUser({email})`
    call. Both the current and new address get a confirmation link
    through our branded system; once both are clicked, Supabase
    completes the change exactly as before, and the existing
    `POST /me/email/confirm` mirrors it locally — that endpoint hasn't
    changed."""
    await MeService.request_email_change(
        session, user, new_email=payload.new_email, supabase=supabase
    )


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
