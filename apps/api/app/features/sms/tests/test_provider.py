"""Tests for the stub + Hubtel SMS providers, and the factory.

`HubtelSmsProvider`'s real network call is mocked with `respx` — no
live Hubtel account exists to send against, so this covers the
request/response contract (success, rejected, network error) rather
than an end-to-end send. Same "no live account, mock the transport"
posture as the email tests take toward SMTP, adapted for an HTTP API.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.core.config import settings
from app.features.sms.constants import ARKESEL, HUBTEL
from app.integrations.sms.provider import (
    _ARKESEL_SEND_URL,
    _HUBTEL_SEND_URL,
    ArkeselSmsProvider,
    HubtelSmsProvider,
    StubSmsProvider,
    get_sms_provider,
)


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


def test_factory_returns_stub_provider_when_nothing_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "arkesel_api_key", None)
    monkeypatch.setattr(settings, "arkesel_sender_id", None)
    monkeypatch.setattr(settings, "hubtel_client_id", None)
    monkeypatch.setattr(settings, "hubtel_client_secret", None)
    monkeypatch.setattr(settings, "hubtel_sender_id", None)
    assert isinstance(get_sms_provider(), StubSmsProvider)


def test_factory_returns_hubtel_provider_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "arkesel_api_key", None)
    monkeypatch.setattr(settings, "arkesel_sender_id", None)
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    assert isinstance(get_sms_provider(), HubtelSmsProvider)


@pytest.mark.parametrize(
    ("client_id", "client_secret", "sender_id"),
    [
        (None, "s", "UHAS"),
        ("id", None, "UHAS"),
        ("id", "s", None),
    ],
)
def test_factory_falls_back_when_partially_configured(
    monkeypatch: pytest.MonkeyPatch,
    client_id: str | None,
    client_secret: str | None,
    sender_id: str | None,
) -> None:
    monkeypatch.setattr(settings, "arkesel_api_key", None)
    monkeypatch.setattr(settings, "arkesel_sender_id", None)
    monkeypatch.setattr(settings, "hubtel_client_id", client_id)
    monkeypatch.setattr(settings, "hubtel_client_secret", client_secret)
    monkeypatch.setattr(settings, "hubtel_sender_id", sender_id)
    assert isinstance(get_sms_provider(), StubSmsProvider)


def test_factory_returns_arkesel_provider_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "arkesel_api_key", "key")
    monkeypatch.setattr(settings, "arkesel_sender_id", "UHAS")
    assert isinstance(get_sms_provider(), ArkeselSmsProvider)


def test_factory_prefers_hubtel_over_arkesel_when_both_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "arkesel_api_key", "key")
    monkeypatch.setattr(settings, "arkesel_sender_id", "UHAS")
    monkeypatch.setattr(settings, "hubtel_client_id", "id")
    monkeypatch.setattr(settings, "hubtel_client_secret", "secret")
    monkeypatch.setattr(settings, "hubtel_sender_id", "UHAS")
    assert isinstance(get_sms_provider(), HubtelSmsProvider)


@respx.mock
async def test_hubtel_provider_sent_on_status_zero() -> None:
    respx.get(_HUBTEL_SEND_URL).mock(
        return_value=httpx.Response(200, json={"Status": 0, "MessageId": "msg-123", "Rate": 1})
    )
    provider = HubtelSmsProvider(client_id="id", client_secret="secret", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Your ward's fee is overdue.")
    assert result.status == "sent"
    assert result.provider_message_id == "msg-123"


@respx.mock
async def test_hubtel_provider_failed_on_nonzero_status() -> None:
    respx.get(_HUBTEL_SEND_URL).mock(
        return_value=httpx.Response(200, json={"Status": 1001, "MessageId": None})
    )
    provider = HubtelSmsProvider(client_id="id", client_secret="secret", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Body")
    assert result.status == "failed"


@respx.mock
async def test_hubtel_provider_failed_on_http_error() -> None:
    respx.get(_HUBTEL_SEND_URL).mock(return_value=httpx.Response(500))
    provider = HubtelSmsProvider(client_id="id", client_secret="secret", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Body")
    assert result.status == "failed"
    assert result.provider_message_id is None


@respx.mock
async def test_hubtel_provider_authenticates_with_basic_auth_not_query_params() -> None:
    route = respx.get(_HUBTEL_SEND_URL).mock(
        return_value=httpx.Response(200, json={"Status": 0, "MessageId": "msg-456"})
    )
    provider = HubtelSmsProvider(client_id="myid", client_secret="mysecret", sender_id="UHAS")
    await provider.send(phone="+233241110001", body="Body")

    request = route.calls.last.request
    assert "clientsecret" not in str(request.url).lower()
    assert request.headers["authorization"].startswith("Basic ")


def test_hubtel_name_is_hubtel() -> None:
    provider = HubtelSmsProvider(client_id="id", client_secret="secret", sender_id="UHAS")
    assert provider.name == HUBTEL


@respx.mock
async def test_arkesel_provider_sent_on_2xx() -> None:
    respx.post(_ARKESEL_SEND_URL).mock(
        return_value=httpx.Response(200, json={"status": "success", "data": {"id": "msg-789"}})
    )
    provider = ArkeselSmsProvider(api_key="key", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Your ward's fee is overdue.")
    assert result.status == "sent"
    assert result.provider_message_id == "msg-789"


@respx.mock
async def test_arkesel_provider_sent_even_without_recognisable_id_field() -> None:
    """Response-shape parsing is best-effort (see provider docstring) —
    a 2xx with an unexpected body still counts as sent, just with no
    message id to record."""
    respx.post(_ARKESEL_SEND_URL).mock(return_value=httpx.Response(200, json={"ok": True}))
    provider = ArkeselSmsProvider(api_key="key", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Body")
    assert result.status == "sent"
    assert result.provider_message_id is None


@respx.mock
async def test_arkesel_provider_failed_on_http_error() -> None:
    respx.post(_ARKESEL_SEND_URL).mock(return_value=httpx.Response(401))
    provider = ArkeselSmsProvider(api_key="bad-key", sender_id="UHAS")
    result = await provider.send(phone="+233241110001", body="Body")
    assert result.status == "failed"
    assert result.provider_message_id is None


@respx.mock
async def test_arkesel_provider_sends_expected_request_shape() -> None:
    route = respx.post(_ARKESEL_SEND_URL).mock(
        return_value=httpx.Response(200, json={"data": {"id": "msg-1"}})
    )
    provider = ArkeselSmsProvider(api_key="my-key", sender_id="UHAS")
    await provider.send(phone="+233241110001", body="Hello")

    request = route.calls.last.request
    assert request.headers["api-key"] == "my-key"
    body = json.loads(request.content)
    assert body == {"sender": "UHAS", "message": "Hello", "recipients": ["+233241110001"]}


def test_arkesel_name_is_arkesel() -> None:
    provider = ArkeselSmsProvider(api_key="key", sender_id="UHAS")
    assert provider.name == ARKESEL
