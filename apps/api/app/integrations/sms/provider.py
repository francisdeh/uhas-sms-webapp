"""`SmsProvider` interface, the no-op `StubSmsProvider`, and the real
`HubtelSmsProvider` — same "missing config isn't an error" contract as
`app/integrations/email/provider.py`: `get_sms_provider()` falls back
to the stub whenever Hubtel credentials aren't all set, so every
environment (dev, CI, tests) runs the same code path without a live
account.
"""

from __future__ import annotations

import logging
import uuid
from typing import Protocol

import httpx

from app.core.config import settings
from app.features.sms.constants import HUBTEL, STUB, SmsProviderName, SmsStatus

logger = logging.getLogger(__name__)

_HUBTEL_SEND_URL = "https://smsc.hubtel.com/v1/messages/send"


class SmsSendResult:
    """What a provider hands back after attempting a send."""

    __slots__ = ("provider_message_id", "status")

    def __init__(self, *, provider_message_id: str | None, status: SmsStatus) -> None:
        self.provider_message_id = provider_message_id
        self.status = status


class SmsProvider(Protocol):
    """One method: send a message, get back a provider message id +
    initial status. Hubtel's Quick Send API is synchronous (the HTTP
    response tells us whether it was accepted), so `HubtelSmsProvider`
    returns `sent`/`failed` directly — there's no delivery-callback
    webhook in this codebase yet to later promote a row to
    `delivered`."""

    name: SmsProviderName

    async def send(self, *, phone: str, body: str) -> SmsSendResult: ...


class StubSmsProvider:
    """Logs the send attempt (via the caller's own logger — this class
    stays dependency-free) and returns a synthetic `sent` result. No
    network call, no cost, safe to run in every environment including
    CI."""

    name: SmsProviderName = STUB

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        return SmsSendResult(
            provider_message_id=f"stub-{uuid.uuid4().hex[:12]}",
            status="sent",
        )


class HubtelSmsProvider:
    """Real provider — Hubtel's Quick Send API
    (https://businessdocs-developers.hubtel.com/docs/simple-messaging).

    `GET {_HUBTEL_SEND_URL}?From=&To=&Content=`, authenticated with
    HTTP Basic (ClientId as username, ClientSecret as password) rather
    than the query-param credential variant Hubtel also supports —
    keeps secrets out of URLs that might land in logs. A successful
    response is JSON `{"Status": 0, "MessageId": "...", ...}`; any
    other `Status`, a non-2xx response, or a network error is `failed`.
    """

    name: SmsProviderName = HUBTEL

    def __init__(self, *, client_id: str, client_secret: str, sender_id: str) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._sender_id = sender_id

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    _HUBTEL_SEND_URL,
                    params={"From": self._sender_id, "To": phone, "Content": body},
                    auth=(self._client_id, self._client_secret),
                )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("[sms] Hubtel send to %s failed: %s", phone, exc)
            return SmsSendResult(provider_message_id=None, status="failed")

        if data.get("Status") == 0:
            return SmsSendResult(provider_message_id=data.get("MessageId"), status="sent")
        logger.error("[sms] Hubtel send to %s rejected: %s", phone, data)
        return SmsSendResult(provider_message_id=data.get("MessageId"), status="failed")


def get_sms_provider() -> SmsProvider:
    if settings.hubtel_client_id and settings.hubtel_client_secret and settings.hubtel_sender_id:
        return HubtelSmsProvider(
            client_id=settings.hubtel_client_id,
            client_secret=settings.hubtel_client_secret,
            sender_id=settings.hubtel_sender_id,
        )
    return StubSmsProvider()
