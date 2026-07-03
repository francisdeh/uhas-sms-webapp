"""Service-level tests for SmsService — the DB-touching half.

Uses the real `StubSmsProvider` (no mocking needed — it's already a
no-op) to prove the write-then-send-then-update flow lands a fully
populated row.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.sms.model import SmsLog
from app.features.sms.service import SmsService
from app.features.sms.tests.conftest import GUARDIAN_UUID, SCHOOL_UUID


async def test_send_writes_a_row_with_stub_provider_result(
    db_session: AsyncSession, seed_guardian: Guardian
) -> None:
    row = await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="absence",
        body="Your child was marked absent today.",
    )
    assert row.status == "sent"
    assert row.provider == "stub"
    assert row.provider_message_id is not None
    assert row.category == "absence"

    persisted = (await db_session.execute(select(SmsLog).where(SmsLog.id == row.id))).scalar_one()
    assert persisted.recipient_phone == "+233241110001"


async def test_send_without_linked_guardian(db_session: AsyncSession, seed_school: School) -> None:
    row = await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110099",
        recipient_guardian_id=None,
        category="other",
        body="Unlinked recipient.",
    )
    assert row.recipient_guardian_id is None


async def test_list_for_school_filters_by_category(
    db_session: AsyncSession, seed_guardian: Guardian
) -> None:
    await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="absence",
        body="Absence notice.",
    )
    await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="results",
        body="Results notice.",
    )

    absence_rows, absence_total = await SmsService.list_for_school(
        db_session, SCHOOL_UUID, category="absence"
    )
    assert absence_total == 1
    assert absence_rows[0].category == "absence"

    _, all_total = await SmsService.list_for_school(db_session, SCHOOL_UUID)
    assert all_total == 2
