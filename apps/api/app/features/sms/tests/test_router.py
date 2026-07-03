"""HTTP-level tests for `GET /sms-log`."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.sms.service import SmsService
from app.features.sms.tests.conftest import GUARDIAN_UUID, SCHOOL_UUID, auth_header


async def test_requires_auth(client: AsyncClient, seed_guardian: Guardian) -> None:
    res = await client.get("/sms-log")
    assert res.status_code == 401


async def test_non_admin_forbidden(client: AsyncClient, seed_guardian: Guardian) -> None:
    res = await client.get("/sms-log", headers=auth_header(role="Teacher"))
    assert res.status_code == 403


async def test_admin_sees_logged_send(
    client: AsyncClient, db_session: AsyncSession, seed_guardian: Guardian
) -> None:
    await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="absence",
        body="Your child was marked absent today.",
    )

    res = await client.get("/sms-log", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["status"] == "sent"
    assert body["items"][0]["provider"] == "stub"
    assert body["items"][0]["recipientPhone"] == "+233241110001"


async def test_category_filter(
    client: AsyncClient, db_session: AsyncSession, seed_guardian: Guardian
) -> None:
    await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="absence",
        body="Absence.",
    )
    await SmsService.send(
        db_session,
        school_id=SCHOOL_UUID,
        recipient_phone="+233241110001",
        recipient_guardian_id=GUARDIAN_UUID,
        category="fee_reminder",
        body="Fee reminder.",
    )

    res = await client.get(
        "/sms-log", params={"category": "fee_reminder"}, headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "fee_reminder"
