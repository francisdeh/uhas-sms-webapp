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
from typing import Any, Protocol, cast
from uuid import UUID

from app.core.config import settings
from app.core.errors import ServiceUnavailableError

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
        email: str,
        password: str,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]: ...

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None: ...

    async def delete_user(self, user_id: UUID | str) -> None: ...


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
        email: str,
        password: str,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise ServiceUnavailableError(self._MSG)

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None:
        raise ServiceUnavailableError(self._MSG)

    async def delete_user(self, user_id: UUID | str) -> None:
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
        email: str,
        password: str,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        def _run() -> dict[str, Any]:
            resp = self._client.auth.admin.create_user(
                cast(
                    Any,
                    {
                        "email": email,
                        "password": password,
                        "email_confirm": True,
                        "app_metadata": app_metadata,
                        "user_metadata": user_metadata or {},
                    },
                )
            )
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
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {}
        if email is not None:
            payload["email"] = email
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
