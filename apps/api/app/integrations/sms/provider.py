"""`SmsProvider` interface — Hubtel is the intended first real
implementation; a swap later is a one-file change (per
`v2/UHAS_Backend_Architecture_v1.1.md` §8.1).

No Hubtel account/sender-ID exists yet, so this module ships only the
interface + a `StubSmsProvider`: it logs the send and returns a fake
message id instead of calling a real API. `get_sms_provider()` always
resolves to the stub today — swap that one function when Hubtel
credentials land, no call sites change.
"""

from __future__ import annotations

import uuid
from typing import Protocol

from app.features.sms.constants import STUB, SmsProviderName, SmsStatus


class SmsSendResult:
    """What a provider hands back after attempting a send."""

    __slots__ = ("provider_message_id", "status")

    def __init__(self, *, provider_message_id: str | None, status: SmsStatus) -> None:
        self.provider_message_id = provider_message_id
        self.status = status


class SmsProvider(Protocol):
    """One method: send a message, get back a provider message id +
    initial status. Real providers (Hubtel) return `queued`/`sent` here
    and update `delivered`/`failed` later via a webhook callback — that
    callback endpoint doesn't exist yet either; it lands with the real
    Hubtel implementation."""

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


def get_sms_provider() -> SmsProvider:
    """Factory — always returns the stub today. Swap in a
    `HubtelSmsProvider` here (reading `settings.hubtel_api_key` /
    `settings.hubtel_sender_id`) once the account is registered; no
    caller of `SmsService.send` needs to change."""
    return StubSmsProvider()
