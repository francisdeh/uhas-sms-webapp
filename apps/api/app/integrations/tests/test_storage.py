"""Tests for the Supabase Storage integration.

`RealStorageClient`'s actual HTTP calls aren't covered here — same
convention as `RealSupabaseAdminClient` (see `features/users/tests`):
CI's Postgres-only service has no Supabase Storage to call against.
Its correctness was verified manually against a live local Supabase
instance during development. What's covered: the not-configured stub
fails loudly instead of silently no-op'ing, and the factory resolves
to the right implementation based on config.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable

import pytest

from app.core.config import settings
from app.core.errors import ServiceUnavailableError
from app.integrations.storage import (
    RealStorageClient,
    StorageClient,
    _NotConfiguredStorageClient,
    get_storage_client,
)


@pytest.mark.parametrize(
    "call",
    [
        lambda c: c.upload("photos", "x.png", b"data"),
        lambda c: c.get_public_url("photos", "x.png"),
        lambda c: c.get_signed_url("documents", "x.pdf"),
    ],
)
async def test_not_configured_client_raises_on_every_call(
    call: Callable[[StorageClient], Awaitable[object]],
) -> None:
    client = _NotConfiguredStorageClient()
    with pytest.raises(ServiceUnavailableError):
        await call(client)


def test_factory_returns_stub_when_service_role_key_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_service_role_key", None)
    client = get_storage_client()
    assert isinstance(client, _NotConfiguredStorageClient)


def test_factory_returns_real_client_when_service_role_key_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "supabase_service_role_key", "fake-key")
    client = get_storage_client()
    assert isinstance(client, RealStorageClient)
