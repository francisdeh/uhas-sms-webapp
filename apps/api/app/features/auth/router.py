"""Public, unauthenticated auth-adjacent routes.

    POST /auth/reset-password → always 202, regardless of outcome

Kept out of `/users` (Admin-only user management) and `/me` (requires
a session) since this is the one endpoint in the whole API meant to be
called by someone with no account/session at all.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.rate_limit import PASSWORD_RESET_LIMIT, limiter
from app.features.auth.schema import PasswordResetRequest
from app.features.users.service import UsersService
from app.features.users.supabase_admin import SupabaseAdminClient, get_supabase_admin_client

router = APIRouter(prefix="/auth", tags=["auth"])
_SupabaseDep = Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)]


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Request a password-reset email — no auth required, always 204",
)
@limiter.limit(PASSWORD_RESET_LIMIT)
async def reset_password(
    request: Request,  # required by @limiter.limit, not used directly
    payload: PasswordResetRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    supabase: _SupabaseDep,
) -> Response:
    await UsersService.request_password_reset(session, email=payload.email, supabase=supabase)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
