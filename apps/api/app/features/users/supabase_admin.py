"""Supabase Admin client — server-side auth-user management.

Wraps the tiny slice of the Supabase Auth Admin API we need for
create / update / disable / delete of auth users. Split out so the
service layer stays independent of `supabase-py` and can be tested
against an in-memory fake.

Real deployments set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and
`get_supabase_admin_client` returns `RealSupabaseAdminClient`. When the
service-role key is unset (local dev without a Supabase project), the
dependency yields `_NotConfiguredSupabaseAdminClient`, which raises
`ServiceUnavailableError` on any call — a loud, catchable failure rather
than a silent success.

Tests override the dependency with `FakeSupabaseAdminClient` (see the
`users` test conftest).
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal, Protocol, cast
from uuid import UUID

from app.core.config import settings
from app.core.errors import NotFoundError, ServiceUnavailableError

GenerateLinkType = Literal["invite", "recovery", "email_change_current", "email_change_new"]

PERMANENT_BAN = "876600h"
"""Supabase's idiomatic value for "disable indefinitely" — mirrors the
TS-side `PERMANENT_BAN`. Reactivating an account sets it to `"none"`."""


class SupabaseAdminClient(Protocol):
    """Server-side auth admin operations we need from Supabase.

    Kept minimal: the create/update/delete surface required by the admin
    user-management UI. Keep the Protocol closed — a new method is a
    conscious API extension, not a drive-by add.
    """

    async def create_user(
        self,
        *,
        email: str | None = None,
        password: str,
        phone: str | None = None,
        phone_confirm: bool = False,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        email_confirm: bool = False,
        phone: str | None = None,
        phone_confirm: bool = False,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    async def delete_user(self, user_id: UUID | str) -> None: ...

    async def invite_user_by_email(
        self,
        *,
        email: str,
        redirect_to: str,
    ) -> dict[str, Any]: ...

    async def generate_link(
        self,
        *,
        type: GenerateLinkType,
        email: str,
        redirect_to: str,
        new_email: str | None = None,
    ) -> dict[str, Any]:
        """Mints an auth link WITHOUT sending Supabase's own email —
        the caller sends it via our own branded system instead. Raises
        `NotFoundError` if `email` doesn't correspond to a real account
        (relevant to `recovery`, where the caller must swallow that into
        a generic response to avoid leaking account existence)."""
        ...

    async def reset_mfa(self, user_id: UUID | str) -> int: ...

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]: ...


class _NotConfiguredSupabaseAdminClient:
    """Stub for environments without a Supabase service-role key.

    Every call raises `ServiceUnavailableError`. This is preferable to a
    no-op — a missing service-role key means we can't create or manage
    auth users, and silently succeeding would drift the DB from Supabase.
    """

    _MSG = "Supabase admin client is not configured."

    async def create_user(
        self,
        *,
        email: str | None = None,
        password: str,
        phone: str | None = None,
        phone_confirm: bool = False,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise ServiceUnavailableError(self._MSG)

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        email_confirm: bool = False,
        phone: str | None = None,
        phone_confirm: bool = False,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None:
        raise ServiceUnavailableError(self._MSG)

    async def delete_user(self, user_id: UUID | str) -> None:
        raise ServiceUnavailableError(self._MSG)

    async def invite_user_by_email(self, *, email: str, redirect_to: str) -> dict[str, Any]:
        raise ServiceUnavailableError(self._MSG)

    async def generate_link(
        self,
        *,
        type: GenerateLinkType,
        email: str,
        redirect_to: str,
        new_email: str | None = None,
    ) -> dict[str, Any]:
        raise ServiceUnavailableError(self._MSG)

    async def reset_mfa(self, user_id: UUID | str) -> int:
        raise ServiceUnavailableError(self._MSG)

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]:
        raise ServiceUnavailableError(self._MSG)


class RealSupabaseAdminClient:
    """Adapter around supabase-py's synchronous auth-admin surface.

    supabase-py's admin methods are blocking HTTP calls. Wrapping each
    in `asyncio.to_thread` keeps the FastAPI event loop free while the
    request is in flight.
    """

    def __init__(self, url: str, service_role_key: str) -> None:
        from supabase import create_client

        self._client = create_client(url, service_role_key)

    async def create_user(
        self,
        *,
        email: str | None = None,
        password: str,
        phone: str | None = None,
        phone_confirm: bool = False,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        def _run() -> dict[str, Any]:
            payload: dict[str, Any] = {
                "password": password,
                "app_metadata": app_metadata,
                "user_metadata": user_metadata or {},
            }
            if email is not None:
                payload["email"] = email
                payload["email_confirm"] = True
            if phone is not None:
                payload["phone"] = phone
                payload["phone_confirm"] = phone_confirm
            resp = self._client.auth.admin.create_user(cast(Any, payload))
            user = getattr(resp, "user", None)
            if user is None:
                raise ServiceUnavailableError("Supabase did not return an auth user.")
            return {"id": str(user.id), "email": user.email}

        return await asyncio.to_thread(_run)

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        email_confirm: bool = False,
        phone: str | None = None,
        phone_confirm: bool = False,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {}
        if email is not None:
            payload["email"] = email
            payload["email_confirm"] = email_confirm
        if phone is not None:
            payload["phone"] = phone
            payload["phone_confirm"] = phone_confirm
        if ban_duration is not None:
            payload["ban_duration"] = ban_duration
        if app_metadata is not None:
            payload["app_metadata"] = app_metadata
        if user_metadata is not None:
            payload["user_metadata"] = user_metadata

        def _run() -> None:
            self._client.auth.admin.update_user_by_id(str(user_id), cast(Any, payload))

        await asyncio.to_thread(_run)

    async def delete_user(self, user_id: UUID | str) -> None:
        def _run() -> None:
            self._client.auth.admin.delete_user(str(user_id))

        await asyncio.to_thread(_run)

    async def invite_user_by_email(self, *, email: str, redirect_to: str) -> dict[str, Any]:
        """Creates the auth user AND sends Supabase's built-in invite email.

        `invite_user_by_email` only accepts a `data` bucket (user_metadata)
        — it has no `app_metadata` parameter — so the caller still needs a
        follow-up `update_user_by_id` to set role/school_id/linked_id.
        """

        def _run() -> dict[str, Any]:
            resp = self._client.auth.admin.invite_user_by_email(
                email, cast(Any, {"redirect_to": redirect_to})
            )
            user = getattr(resp, "user", None)
            if user is None:
                raise ServiceUnavailableError("Supabase did not return an auth user.")
            return {"id": str(user.id), "email": user.email}

        return await asyncio.to_thread(_run)

    async def generate_link(
        self,
        *,
        type: GenerateLinkType,
        email: str,
        redirect_to: str,
        new_email: str | None = None,
    ) -> dict[str, Any]:
        """Mints an `action_link` without Supabase sending anything —
        the caller emits it through our own branded email system. A
        nonexistent `email` raises Supabase's own `user_not_found`
        error; re-raised as `NotFoundError` so callers that need
        enumeration-safety (password recovery) can catch specifically
        and still return a generic response."""
        from supabase_auth.errors import AuthApiError

        def _run() -> dict[str, Any]:
            payload: dict[str, Any] = {
                "type": type,
                "email": email,
                "options": {"redirect_to": redirect_to},
            }
            if new_email is not None:
                payload["new_email"] = new_email
            try:
                resp = self._client.auth.admin.generate_link(cast(Any, payload))
            except AuthApiError as exc:
                if exc.code == "user_not_found":
                    raise NotFoundError(f"No account for {email!r}.") from exc
                raise
            action_link = resp.properties.action_link if resp.properties else None
            if not action_link:
                raise ServiceUnavailableError("Supabase did not return an action link.")
            return {
                "action_link": action_link,
                "user_id": str(resp.user.id) if resp.user else None,
            }

        return await asyncio.to_thread(_run)

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]:
        """Reads the auth user straight back from Supabase — used by
        `POST /me/phone/confirm` so the local `phone` mirror can never
        diverge from what Supabase itself has actually confirmed
        (rather than trusting a client-supplied value)."""

        def _run() -> dict[str, Any]:
            resp = self._client.auth.admin.get_user_by_id(str(user_id))
            user = getattr(resp, "user", None)
            if user is None:
                raise ServiceUnavailableError("Supabase did not return an auth user.")
            return {"id": str(user.id), "email": user.email, "phone": user.phone}

        return await asyncio.to_thread(_run)

    async def reset_mfa(self, user_id: UUID | str) -> int:
        """Delete every MFA factor on a user — the admin lockout-recovery
        path when a user loses their authenticator (Supabase has no
        backup codes). Deleting a verified factor also logs the user out
        of all sessions. Returns the number of factors removed."""

        def _run() -> int:
            factors = self._client.auth.admin.mfa.list_factors(cast(Any, {"user_id": str(user_id)}))
            count = 0
            for factor in factors:
                self._client.auth.admin.mfa.delete_factor(
                    cast(Any, {"id": factor.id, "user_id": str(user_id)})
                )
                count += 1
            return count

        return await asyncio.to_thread(_run)


def get_supabase_admin_client() -> SupabaseAdminClient:
    """FastAPI dependency — resolves the appropriate admin client.

    Returns the real supabase-py-backed client when
    `SUPABASE_SERVICE_ROLE_KEY` is present. Otherwise returns the
    not-configured stub so calls fail loudly with 503 instead of silently
    succeeding.
    """
    if settings.supabase_service_role_key:
        return RealSupabaseAdminClient(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
    return _NotConfiguredSupabaseAdminClient()
