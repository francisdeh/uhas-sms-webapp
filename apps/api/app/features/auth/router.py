"""Public, unauthenticated auth-adjacent routes.

    POST /auth/reset-password  → always 202, regardless of outcome
    POST /auth/send-sms-hook   → Supabase Auth's "Send SMS" hook, relays
                                  phone-OTP delivery through our own
                                  SmsProvider (Hubtel) instead of a
                                  natively-supported Supabase provider

Kept out of `/users` (Admin-only user management) and `/me` (requires
a session) since these are the two endpoints in the whole API meant to
be called by someone with no account/session at all — `send-sms-hook`
is authenticated a different way (HMAC signature, not a JWT), since
its caller is Supabase's own Auth service, not a end user.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

from app.core.config import settings
from app.core.db import get_session
from app.core.rate_limit import PASSWORD_RESET_LIMIT, limiter
from app.features.auth.schema import PasswordResetRequest
from app.features.users.service import UsersService
from app.features.users.supabase_admin import SupabaseAdminClient, get_supabase_admin_client
from app.integrations.sms.provider import get_sms_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
_SupabaseDep = Annotated[SupabaseAdminClient, Depends(get_supabase_admin_client)]

# Mirrors `supabase/config.toml`'s `[auth.sms].template` — that field is
# purely informational once this hook is registered (Supabase no longer
# renders it itself; the hook builds the message text from the raw OTP).
_OTP_MESSAGE_TEMPLATE = "UHAS SMS: your verification code is {otp}. Don't share it."


def _hook_error(http_code: int, message: str) -> JSONResponse:
    """Matches the exact error shape Supabase's Send SMS hook contract
    requires — a different envelope from this app's own `AppError`
    subclasses, which is why this endpoint builds responses by hand
    instead of raising."""
    return JSONResponse(
        status_code=http_code,
        content={"error": {"http_code": http_code, "message": message}},
    )


@router.post("/send-sms-hook", include_in_schema=False)
async def send_sms_hook(request: Request) -> Response:
    """Supabase Auth calls this instead of its own built-in SMS
    provider whenever it needs to deliver a phone-OTP (signup
    confirmation, sign-in, phone change) — registered via the hosted
    project's Auth settings (or `[auth.hook.send_sms]` in
    `supabase/config.toml` for local dev). See
    https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook.

    Fails CLOSED if the shared secret isn't configured — unlike every
    other provider in this codebase, a missing secret here must not be
    treated as "safe to skip": it would mean this endpoint accepts
    unsigned requests from anyone who finds the URL.
    """
    if not settings.send_sms_hook_secret:
        logger.error("[auth] send-sms-hook called but SEND_SMS_HOOK_SECRET is unset.")
        return _hook_error(500, "SMS hook not configured.")

    raw_body = await request.body()
    try:
        payload: dict[str, Any] = Webhook(settings.send_sms_hook_secret).verify(
            raw_body, dict(request.headers)
        )
    except WebhookVerificationError:
        return _hook_error(401, "Invalid webhook signature.")

    phone = payload.get("user", {}).get("phone")
    otp = payload.get("sms", {}).get("otp")
    if not phone or not otp:
        return _hook_error(400, "Missing user.phone or sms.otp in payload.")

    result = await get_sms_provider().send(phone=phone, body=_OTP_MESSAGE_TEMPLATE.format(otp=otp))
    if result.status != "sent":
        logger.error("[auth] send-sms-hook: OTP delivery to %s failed.", phone)
        return _hook_error(500, "SMS provider failed to send.")

    return JSONResponse(status_code=200, content={})


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
