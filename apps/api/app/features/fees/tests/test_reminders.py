"""Service-level tests for `FeesService.send_overdue_reminders` — the
weekly job's actual eligibility/idempotency/messaging logic. Uses a
fake `SmsProvider` (records calls, no network) rather than the real
`StubSmsProvider`/`HubtelSmsProvider`, so tests can assert on exactly
what was sent to whom.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.fees.model import FeeItem, LearnerFee
from app.features.fees.service import FeesService
from app.features.fees.tests.conftest import (
    ACADEMIC_YEAR,
    GUARDIAN_UUID,
    SCHOOL_UUID,
    STUDENT1_UUID,
    STUDENT2_UUID,
    STUDENT_JHS2_UUID,
)
from app.features.notifications.model import Notification
from app.features.schools.model import School
from app.features.sms.constants import STUB, SmsProviderName
from app.features.sms.model import SmsLog
from app.features.users.model import User
from app.integrations.sms.provider import SmsSendResult


class _FakeSmsProvider:
    name: SmsProviderName = STUB

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        self.sent.append((phone, body))
        return SmsSendResult(provider_message_id="fake-1", status="sent")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _make_fee_item(session: AsyncSession, *, name: str = "Term Fees") -> FeeItem:
    item = FeeItem(
        school_id=SCHOOL_UUID,
        name=name,
        scope="school",
        academic_year=ACADEMIC_YEAR,
        amount_minor=10_000,
        is_active=True,
    )
    session.add(item)
    await session.flush()
    return item


async def _make_learner_fee(
    session: AsyncSession,
    *,
    student_id: UUID,
    fee_item: FeeItem,
    due_date: date,
    status: str = "outstanding",
    last_reminder_sent_at: datetime | None = None,
) -> LearnerFee:
    row = LearnerFee(
        school_id=SCHOOL_UUID,
        student_id=student_id,
        fee_item_id=fee_item.id,
        amount_minor=fee_item.amount_minor,
        status=status,
        balance_minor=fee_item.amount_minor,
        due_date=due_date,
        last_reminder_sent_at=last_reminder_sent_at,
    )
    session.add(row)
    await session.flush()
    return row


@pytest_asyncio.fixture
async def seed_parent_user(db_session: AsyncSession, seed_school: School) -> User:
    """A User linked to `guardian` (GUARDIAN_UUID) — lets tests verify
    the in-app notification alongside the SMS."""
    user = User(
        id=UUID("00000000-0000-0000-0000-0000000000f1"),
        school_id=SCHOOL_UUID,
        email="ama@example.com",
        role="Parent",
        linked_id=GUARDIAN_UUID,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def test_reminds_guardian_with_overdue_fee_and_phone(
    db_session: AsyncSession,
    seed_guardians: dict[str, object],
    seed_parent_user: User,
) -> None:
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session,
        student_id=STUDENT1_UUID,
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 1
    assert len(provider.sent) == 1
    phone, body = provider.sent[0]
    assert phone == "+233241110001"
    assert "Kofi Mensah" in body
    assert "GHS 100.00" in body

    sms_stmt = select(SmsLog).where(SmsLog.recipient_guardian_id == GUARDIAN_UUID)
    sms_row = (await db_session.execute(sms_stmt)).scalar_one()
    assert sms_row.category == "fee_reminder"

    notification = (
        await db_session.execute(select(Notification).where(Notification.kind == "fee_reminder"))
    ).scalar_one()
    assert notification.user_id == seed_parent_user.id
    assert notification.link == "/parent/fees"


async def test_skips_guardian_without_phone(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session,
        student_id=STUDENT_JHS2_UUID,  # linked to other_guardian, who has no phone
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 0
    assert provider.sent == []


async def test_skips_fee_not_yet_due(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    fee_item = await _make_fee_item(db_session)
    future = date.today() + timedelta(days=30)
    await _make_learner_fee(
        db_session, student_id=STUDENT1_UUID, fee_item=fee_item, due_date=future
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 0


async def test_skips_waived_and_paid_fees(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session,
        student_id=STUDENT1_UUID,
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
        status="waived",
    )
    await _make_learner_fee(
        db_session,
        student_id=STUDENT2_UUID,
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
        status="paid",
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 0


async def test_skips_recently_reminded_fee(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session,
        student_id=STUDENT1_UUID,
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
        last_reminder_sent_at=_now() - timedelta(days=2),
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 0


async def test_reminds_again_after_cooldown_expires(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session,
        student_id=STUDENT1_UUID,
        fee_item=fee_item,
        due_date=date(2025, 1, 1),
        last_reminder_sent_at=_now() - timedelta(days=8),
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 1


async def test_groups_multiple_overdue_fees_for_same_guardian_into_one_sms(
    db_session: AsyncSession, seed_guardians: dict[str, object]
) -> None:
    """student1 and student2 share the same primary guardian (`guardian`,
    per the conftest fixture) — two overdue fees should still produce
    exactly one SMS, not two."""
    fee_item = await _make_fee_item(db_session)
    await _make_learner_fee(
        db_session, student_id=STUDENT1_UUID, fee_item=fee_item, due_date=date(2025, 1, 1)
    )
    await _make_learner_fee(
        db_session, student_id=STUDENT2_UUID, fee_item=fee_item, due_date=date(2025, 1, 1)
    )
    provider = _FakeSmsProvider()

    count = await FeesService.send_overdue_reminders(db_session, SCHOOL_UUID, provider=provider)

    assert count == 2  # two learner_fees rows stamped
    assert len(provider.sent) == 1  # one SMS
    _phone, body = provider.sent[0]
    assert "2 overdue" in body
    assert "GHS 200.00" in body
