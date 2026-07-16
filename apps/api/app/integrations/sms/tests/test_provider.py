"""Tests for the SMS integration.

`HubtelSmsProvider`/`ArkeselSmsProvider`'s real network sends aren't
covered here — no live account to send against in CI. What's covered:
the factory's config-based resolution (Hubtel -> Arkesel -> stub), and
`AllowlistSmsProvider`'s allow/suppress behavior, using a fake wrapped
provider so the real HTTP providers stay untouched.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.features.sms.constants import HUBTEL, SmsProviderName
from app.integrations.sms.provider import (
    AllowlistSmsProvider,
    ArkeselSmsProvider,
    HubtelSmsProvider,
    SmsSendResult,
    StubSmsProvider,
    get_sms_provider,
)


class _FakeProvider:
    """Records every call it receives so tests can assert whether the
    real provider was actually invoked."""

    name: SmsProviderName = HUBTEL

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        self.calls.append(phone)
        return SmsSendResult(provider_message_id="real-send-id", status="sent")


async def test_allowlist_delegates_to_wrapped_provider_for_allowed_number() -> None:
    fake = _FakeProvider()
    provider = AllowlistSmsProvider(wrapped=fake, allowlist=frozenset({"+233200000001"}))

    result = await provider.send(phone="+233200000001", body="hello")

    assert fake.calls == ["+233200000001"]
    assert result.provider_message_id == "real-send-id"
    assert result.status == "sent"


async def test_allowlist_suppresses_send_for_unlisted_number() -> None:
    fake = _FakeProvider()
    provider = AllowlistSmsProvider(wrapped=fake, allowlist=frozenset({"+233200000001"}))

    result = await provider.send(phone="+233209999999", body="hello")

    assert fake.calls == []  # the real provider was never touched
    assert result.status == "sent"  # still reports success — callers shouldn't retry
    assert result.provider_message_id is not None


def test_factory_returns_stub_when_nothing_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", None)
    monkeypatch.setattr(settings, "hubtel_client_secret", None)
    monkeypatch.setattr(settings, "hubtel_sender_id", None)
    monkeypatch.setattr(settings, "arkesel_api_key", None)
    monkeypatch.setattr(settings, "arkesel_sender_id", None)
    assert isinstance(get_sms_provider(), StubSmsProvider)


def test_factory_prefers_hubtel_over_arkesel(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "arkesel_api_key", "key")
    monkeypatch.setattr(settings, "arkesel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "sms_dev_allowlist", None)
    assert isinstance(get_sms_provider(), HubtelSmsProvider)


def test_factory_falls_back_to_arkesel_when_hubtel_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", None)
    monkeypatch.setattr(settings, "hubtel_client_secret", None)
    monkeypatch.setattr(settings, "hubtel_sender_id", None)
    monkeypatch.setattr(settings, "arkesel_api_key", "key")
    monkeypatch.setattr(settings, "arkesel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "sms_dev_allowlist", None)
    assert isinstance(get_sms_provider(), ArkeselSmsProvider)


async def test_factory_wraps_in_allowlist_outside_production_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "sms_dev_allowlist", "+233200000001, +233200000002")
    monkeypatch.setattr(settings, "env", "dev")

    provider = get_sms_provider()
    assert isinstance(provider, AllowlistSmsProvider)

    # Parsed correctly on both sides of the comma (including the space
    # after it) — verified by behavior, not by reaching into the
    # instance's private allowlist set.
    fake = _FakeProvider()
    provider._wrapped = fake  # swap in a spy so this doesn't hit real HTTP
    await provider.send(phone="+233200000002", body="hi")
    assert fake.calls == ["+233200000002"]


def test_factory_ignores_allowlist_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "sms_dev_allowlist", "+233200000001")
    monkeypatch.setattr(settings, "env", "production")

    assert isinstance(get_sms_provider(), HubtelSmsProvider)


def test_factory_skips_allowlist_wrap_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "sms_dev_allowlist", None)
    monkeypatch.setattr(settings, "env", "dev")

    assert isinstance(get_sms_provider(), HubtelSmsProvider)
