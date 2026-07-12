"""Supabase Storage — server-side access for Python callers.

The two buckets (`photos` public, `documents` private) are provisioned
by `supabase/config.toml`; see `apps/web/src/lib/supabase/storage.ts`
for the browser-upload half of this split — most uploads still happen
client-side, directly to Supabase, and never touch this module.

This module exists for the Python-side callers that need storage
access without a browser in the loop: report-card PDF rendering
(`features/exams/report_card_pdf.py`) and batch printing
(`features/exams/jobs/report_card_batch.py`), and any future backend
flow that needs a signed download URL. Bucket names and the
public/private split intentionally mirror the TS side exactly — a
path written by one side must resolve correctly from the other.

Same Protocol + real/stub-client split as
`app.features.users.supabase_admin` — see that module's docstring for
the rationale. Tests override `get_storage_client` with a fake.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Literal, Protocol

from app.core.config import settings

if TYPE_CHECKING:
    from storage3.types import FileOptions
from app.core.errors import ServiceUnavailableError

Bucket = Literal["photos", "documents"]

DEFAULT_SIGNED_URL_TTL_SECONDS = 60 * 60  # 1 hour, matches the TS-side default.


class StorageClient(Protocol):
    """Server-side Supabase Storage operations Python callers need.

    Kept minimal: upload, public URL (for `photos`), signed URL (for
    `documents`). Deletion/listing aren't needed yet — add when a real
    caller needs them.
    """

    async def upload(
        self,
        bucket: Bucket,
        path: str,
        data: bytes,
        *,
        content_type: str | None = None,
        upsert: bool = False,
    ) -> None: ...

    async def download(self, bucket: Bucket, path: str) -> bytes: ...

    async def get_public_url(self, bucket: Bucket, path: str) -> str: ...

    async def get_signed_url(
        self,
        bucket: Bucket,
        path: str,
        *,
        ttl_seconds: int = DEFAULT_SIGNED_URL_TTL_SECONDS,
    ) -> str: ...


class _NotConfiguredStorageClient:
    """Stub for environments without a Supabase service-role key.

    Every call raises `ServiceUnavailableError` — silently no-op'ing a
    storage write would produce a DB row pointing at a file that was
    never actually saved.
    """

    _MSG = "Supabase storage client is not configured."

    async def upload(
        self,
        bucket: Bucket,
        path: str,
        data: bytes,
        *,
        content_type: str | None = None,
        upsert: bool = False,
    ) -> None:
        raise ServiceUnavailableError(self._MSG)

    async def download(self, bucket: Bucket, path: str) -> bytes:
        raise ServiceUnavailableError(self._MSG)

    async def get_public_url(self, bucket: Bucket, path: str) -> str:
        raise ServiceUnavailableError(self._MSG)

    async def get_signed_url(
        self,
        bucket: Bucket,
        path: str,
        *,
        ttl_seconds: int = DEFAULT_SIGNED_URL_TTL_SECONDS,
    ) -> str:
        raise ServiceUnavailableError(self._MSG)


class RealStorageClient:
    """Adapter around supabase-py's synchronous storage surface.

    supabase-py's storage methods are blocking HTTP calls; each is
    wrapped in `asyncio.to_thread` to keep the event loop free while
    the request is in flight — same pattern as `RealSupabaseAdminClient`.
    """

    def __init__(self, url: str, service_role_key: str) -> None:
        from supabase import create_client

        self._client = create_client(url, service_role_key)

    async def upload(
        self,
        bucket: Bucket,
        path: str,
        data: bytes,
        *,
        content_type: str | None = None,
        upsert: bool = False,
    ) -> None:
        def _run() -> None:
            file_options: FileOptions = {"upsert": "true" if upsert else "false"}
            if content_type:
                file_options["content-type"] = content_type
            self._client.storage.from_(bucket).upload(path, data, file_options)

        await asyncio.to_thread(_run)

    async def download(self, bucket: Bucket, path: str) -> bytes:
        def _run() -> bytes:
            return self._client.storage.from_(bucket).download(path)

        return await asyncio.to_thread(_run)

    async def get_public_url(self, bucket: Bucket, path: str) -> str:
        def _run() -> str:
            return self._client.storage.from_(bucket).get_public_url(path)

        return await asyncio.to_thread(_run)

    async def get_signed_url(
        self,
        bucket: Bucket,
        path: str,
        *,
        ttl_seconds: int = DEFAULT_SIGNED_URL_TTL_SECONDS,
    ) -> str:
        def _run() -> str:
            resp = self._client.storage.from_(bucket).create_signed_url(path, ttl_seconds)
            url = resp.get("signedUrl") or resp.get("signedURL")
            if not url:
                raise ServiceUnavailableError("Supabase did not return a signed URL.")
            return url

        return await asyncio.to_thread(_run)


def get_storage_client() -> StorageClient:
    """FastAPI dependency / plain-call factory — resolves the right client.

    Returns the real supabase-py-backed client when
    `SUPABASE_SERVICE_ROLE_KEY` is present, otherwise the not-configured
    stub so calls fail loudly (503) instead of silently no-op'ing.
    """
    if settings.supabase_service_role_key:
        return RealStorageClient(settings.supabase_url, settings.supabase_service_role_key)
    return _NotConfiguredStorageClient()
