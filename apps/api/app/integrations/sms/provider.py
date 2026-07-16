"""`SmsProvider` interface, the no-op `StubSmsProvider`, and the real
`HubtelSmsProvider`/`ArkeselSmsProvider` — same "missing config isn't
an error" contract as `app/integrations/email/provider.py`:
`get_sms_provider()` falls back through Hubtel -> Arkesel -> the stub
depending on which credentials are set, so every environment (dev, CI,
tests) runs the same code path without a live account. Hubtel is the
school's chosen provider and takes precedence when configured.
"""

from __future__ import annotations

import logging
import uuid
from typing import Protocol

import httpx

from app.core.config import settings
from app.features.sms.constants import ARKESEL, HUBTEL, STUB, SmsProviderName, SmsStatus

logger = logging.getLogger(__name__)

_HUBTEL_SEND_URL = "https://smsc.hubtel.com/v1/messages/send"
_ARKESEL_SEND_URL = "https://sms.arkesel.com/api/v2/sms/send"


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

    `GET {_HUBTEL_SEND_URL}?clientid=&clientsecret=&from=&to=&content=`.
    HTTP Basic auth (ClientId/ClientSecret as username/password) looks
    like the safer option — keeps secrets out of the URL — but this
    endpoint rejects it outright (`"Client ID is null or empty"`,
    confirmed against a live account); query params are the only
    credential mechanism it actually accepts. Because that puts the
    secret in the request URL, `send()` deliberately never logs the
    raised exception object itself (`httpx.HTTPStatusError.__str__`
    embeds the full request URL) — only a fixed message + phone number.
    A successful response is JSON `{"Status": 0, "MessageId": "...", ...}`;
    any other `Status`, a non-2xx response, or a network error is `failed`.
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
                    params={
                        "clientid": self._client_id,
                        "clientsecret": self._client_secret,
                        "from": self._sender_id,
                        "to": phone,
                        "content": body,
                    },
                )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError:
            logger.error("[sms] Hubtel send to %s failed", phone)
            return SmsSendResult(provider_message_id=None, status="failed")

        if data.get("Status") == 0:
            return SmsSendResult(provider_message_id=data.get("MessageId"), status="sent")
        logger.error("[sms] Hubtel send to %s rejected: %s", phone, data)
        return SmsSendResult(provider_message_id=data.get("MessageId"), status="failed")


class ArkeselSmsProvider:
    """Real provider — Arkesel's SMS v2 API
    (https://developers.arkesel.com/).

    `POST {_ARKESEL_SEND_URL}` with an `api-key` header and a JSON body
    `{"sender", "message", "recipients": [phone]}`. Arkesel's public
    docs don't show a fully worked success-response example, so this
    treats a 2xx HTTP status as the send-accepted signal (the one
    behavior consistently documented) and best-effort extracts a
    message id from whatever shape comes back, tolerating its absence
    — mirrors `HubtelSmsProvider`'s failure handling otherwise.
    """

    name: SmsProviderName = ARKESEL

    def __init__(self, *, api_key: str, sender_id: str) -> None:
        self._api_key = api_key
        self._sender_id = sender_id

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    _ARKESEL_SEND_URL,
                    headers={"api-key": self._api_key},
                    json={"sender": self._sender_id, "message": body, "recipients": [phone]},
                )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("[sms] Arkesel send to %s failed: %s", phone, exc)
            return SmsSendResult(provider_message_id=None, status="failed")

        message_id = None
        if isinstance(data, dict):
            nested = data.get("data")
            message_id = data.get("id") or (nested.get("id") if isinstance(nested, dict) else None)
        return SmsSendResult(provider_message_id=message_id, status="sent")


class AllowlistSmsProvider:
    """Wraps a real provider so only allowlisted numbers ever get a real
    send — every other number is logged and handed the same synthetic
    `sent` result `StubSmsProvider` returns, with no network call and
    no cost. Unlike email's `dev_redirect` (which resends everything to
    one address so nothing is lost), SMS is billed per-message, so the
    right behavior for dev/demo traffic is to suppress it entirely
    rather than reroute it — the point is to spend zero credits on
    numbers nobody is actually going to check, while still exercising
    the real provider end-to-end for the numbers that matter."""

    def __init__(self, *, wrapped: SmsProvider, allowlist: frozenset[str]) -> None:
        self._wrapped = wrapped
        self._allowlist = allowlist
        self.name = wrapped.name

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        if phone in self._allowlist:
            return await self._wrapped.send(phone=phone, body=body)
        logger.info("[sms] dev allowlist: suppressed real send to %s", phone)
        return SmsSendResult(
            provider_message_id=f"dev-suppressed-{uuid.uuid4().hex[:12]}", status="sent"
        )


def get_sms_provider() -> SmsProvider:
    provider: SmsProvider
    if settings.hubtel_client_id and settings.hubtel_client_secret and settings.hubtel_sender_id:
        provider = HubtelSmsProvider(
            client_id=settings.hubtel_client_id,
            client_secret=settings.hubtel_client_secret,
            sender_id=settings.hubtel_sender_id,
        )
    elif settings.arkesel_api_key and settings.arkesel_sender_id:
        provider = ArkeselSmsProvider(
            api_key=settings.arkesel_api_key,
            sender_id=settings.arkesel_sender_id,
        )
    else:
        return StubSmsProvider()

    if settings.env != "production" and settings.sms_dev_allowlist:
        allowlist = frozenset(p.strip() for p in settings.sms_dev_allowlist.split(",") if p.strip())
        return AllowlistSmsProvider(wrapped=provider, allowlist=allowlist)
    return provider
