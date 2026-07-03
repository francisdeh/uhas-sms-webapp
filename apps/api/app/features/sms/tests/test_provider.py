"""Tests for the stub SMS provider + factory."""

from __future__ import annotations

from app.features.sms.constants import STUB
from app.integrations.sms.provider import StubSmsProvider, get_sms_provider


async def test_stub_provider_returns_sent_with_a_fake_message_id() -> None:
    provider = StubSmsProvider()
    result = await provider.send(phone="+233241110001", body="Test message")
    assert result.status == "sent"
    assert result.provider_message_id is not None
    assert result.provider_message_id.startswith("stub-")


async def test_stub_provider_message_ids_are_unique() -> None:
    provider = StubSmsProvider()
    a = await provider.send(phone="+233241110001", body="A")
    b = await provider.send(phone="+233241110001", body="B")
    assert a.provider_message_id != b.provider_message_id


def test_factory_returns_stub_provider() -> None:
    provider = get_sms_provider()
    assert provider.name == STUB
