"""Business logic for the SMS domain.

`send(...)` is the single entry point every future caller (attendance
absence alerts, results-published notices, fee reminders, announcement
broadcast) will go through — see `features/sms/jobs/sms_fanout.py` for
the Inngest job that wraps this for event-triggered fan-out. Wiring
those real trigger points into their producer domains is deferred;
this PR lands the mechanism + the no-op-safe stub provider per the
Phase 3 plan.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.sms.constants import SmsCategory
from app.features.sms.model import SmsLog
from app.features.sms.repository import SmsRepository
from app.integrations.sms.provider import SmsProvider, get_sms_provider


class SmsService:
    @staticmethod
    async def send(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        recipient_phone: str,
        recipient_guardian_id: UUID | str | None,
        category: SmsCategory,
        body: str,
        provider: SmsProvider | None = None,
    ) -> SmsLog:
        """Write the `sms_log` row, then attempt the send, then update
        the row with the provider's result.

        The write-before-send ordering means a provider timeout or a
        process crash mid-call still leaves a `queued` row instead of
        losing the attempt entirely — a human (or a future reconciler
        job) can see it and retry.
        """
        provider = provider or get_sms_provider()

        row = await SmsRepository.insert(
            session,
            school_id=school_id,
            recipient_phone=recipient_phone,
            recipient_guardian_id=recipient_guardian_id,
            category=category,
            body=body,
            provider=provider.name,
        )

        result = await provider.send(phone=recipient_phone, body=body)
        row.provider_message_id = result.provider_message_id
        row.status = result.status
        await session.flush()
        return row

    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        category: SmsCategory | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[SmsLog], int]:
        return await SmsRepository.list_for_school(
            session, school_id, category=category, page=page, size=size
        )
