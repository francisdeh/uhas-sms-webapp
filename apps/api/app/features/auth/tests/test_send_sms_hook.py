"""Tests for `POST /auth/send-sms-hook` — Supabase Auth's custom "Send
SMS" hook, relaying phone-OTP delivery through our own `SmsProvider`.

Builds real, validly-signed requests using the same `standardwebhooks`
library the endpoint verifies against (`Webhook.sign`), rather than
mocking verification away — the HMAC check is exactly the part of this
endpoint most worth exercising for real.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from standardwebhooks.webhooks import Webhook

from app.core.config import settings
from app.integrations.sms.provider import SmsSendResult

pytestmark = pytest.mark.asyncio

_SECRET = "v1,whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"


class _FakeSmsProvider:
    name = "stub"

    def __init__(self, status: str = "sent") -> None:
        self._status = status
        self.calls: list[dict[str, Any]] = []

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        self.calls.append({"phone": phone, "body": body})
        return SmsSendResult(provider_message_id="fake-1", status=self._status)  # type: ignore[arg-type]


def _signed_request(payload: dict[str, Any]) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode()
    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    timestamp = datetime.now(UTC)
    signature = Webhook(_SECRET).sign(msg_id=msg_id, timestamp=timestamp, data=body.decode())
    headers = {
        "webhook-id": msg_id,
        "webhook-timestamp": str(int(timestamp.timestamp())),
        "webhook-signature": signature,
    }
    return body, headers


def _otp_payload(phone: str = "+233241110001", otp: str = "561166") -> dict[str, Any]:
    return {
        "user": {"id": str(uuid.uuid4()), "phone": phone, "app_metadata": {"provider": "phone"}},
        "sms": {"otp": otp},
    }


async def test_returns_500_when_secret_not_configured(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", None)
    body, headers = _signed_request(_otp_payload())
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 500
    assert res.json()["error"]["http_code"] == 500


async def test_rejects_invalid_signature(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    body, headers = _signed_request(_otp_payload())
    headers["webhook-signature"] = "v1," + "A" * 44  # well-formed but wrong
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 401
    assert "signature" in res.json()["error"]["message"].lower()


async def test_rejects_signature_from_a_different_secret(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    payload = _otp_payload()
    body = json.dumps(payload).encode()
    msg_id = f"msg_{uuid.uuid4().hex[:12]}"
    timestamp = datetime.now(UTC)
    wrong_secret_signature = Webhook("v1,whsec_" + "B" * 32).sign(
        msg_id=msg_id, timestamp=timestamp, data=body.decode()
    )
    headers = {
        "webhook-id": msg_id,
        "webhook-timestamp": str(int(timestamp.timestamp())),
        "webhook-signature": wrong_secret_signature,
    }
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 401


async def test_relays_valid_payload_to_sms_provider(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    fake = _FakeSmsProvider(status="sent")
    monkeypatch.setattr("app.features.auth.router.get_sms_provider", lambda: fake)

    body, headers = _signed_request(_otp_payload(phone="+233241110001", otp="778899"))
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)

    assert res.status_code == 200
    assert res.json() == {}
    assert len(fake.calls) == 1
    assert fake.calls[0]["phone"] == "+233241110001"
    assert "778899" in fake.calls[0]["body"]


async def test_returns_500_when_provider_fails(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    fake = _FakeSmsProvider(status="failed")
    monkeypatch.setattr("app.features.auth.router.get_sms_provider", lambda: fake)

    body, headers = _signed_request(_otp_payload())
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 500


async def test_rejects_payload_missing_phone(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    payload = {"user": {"id": str(uuid.uuid4())}, "sms": {"otp": "123456"}}
    body, headers = _signed_request(payload)
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 400


async def test_rejects_payload_missing_otp(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "send_sms_hook_secret", _SECRET)
    payload = {"user": {"id": str(uuid.uuid4()), "phone": "+233241110001"}, "sms": {}}
    body, headers = _signed_request(payload)
    res = await client.post("/auth/send-sms-hook", content=body, headers=headers)
    assert res.status_code == 400
