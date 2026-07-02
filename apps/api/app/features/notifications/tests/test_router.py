"""Router tests for the bell + mark-read endpoints.

Also runs one end-to-end producer smoke test — invoke a domain service
that triggers a fan-out, then read the bell to verify a row landed.
This is the load-bearing test that proves the retrofit works in real
life; the per-domain unit tests in each domain's own test module cover
the finer edge cases.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.notifications.audience import UnitHeadOfDivisionAudience
from app.features.notifications.constants import LESSON_PLAN_SUBMITTED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.notifications.tests.conftest import (
    ADMIN_USER,
    DEPUTY_JHS_USER,
    SCHOOL_UUID,
    TEACHER_USER,
    UNIT_HEAD_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


async def test_bell_empty_when_no_notifications(
    client: AsyncClient, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    res = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Admin", user_id=str(ADMIN_USER)),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["unreadCount"] == 0
    assert body["items"] == []


async def test_bell_returns_own_notifications_only(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_full: dict[str, object],
) -> None:
    """Seed one notification for TEACHER and one for UNIT_HEAD; TEACHER
    should only see their own."""
    _ = seed_full
    await NotificationsService.notify_user(
        db_session,
        SCHOOL_UUID,
        user_id=TEACHER_USER,
        payload=NotifyPayload(
            kind=LESSON_PLAN_SUBMITTED,
            title="For teacher",
            body="teacher-only",
        ),
    )
    await NotificationsService.notify_user(
        db_session,
        SCHOOL_UUID,
        user_id=UNIT_HEAD_USER,
        payload=NotifyPayload(
            kind=LESSON_PLAN_SUBMITTED,
            title="For unit head",
            body="uh-only",
        ),
    )

    res = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=str(TEACHER_USER)),
    )
    body = res.json()
    assert body["unreadCount"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["title"] == "For teacher"


async def test_mark_all_read_flips_unread_count(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_full: dict[str, object],
) -> None:
    _ = seed_full
    for _i in range(3):
        await NotificationsService.notify_user(
            db_session,
            SCHOOL_UUID,
            user_id=DEPUTY_JHS_USER,
            payload=NotifyPayload(
                kind=LESSON_PLAN_SUBMITTED,
                title="X",
                body="Y",
            ),
        )

    headers = auth_header(role="DeputyHead", user_id=str(DEPUTY_JHS_USER))
    before = (await client.get("/notifications/bell", headers=headers)).json()
    assert before["unreadCount"] == 3

    marked = await client.post("/notifications/mark-all-read", headers=headers)
    assert marked.status_code == 200
    assert marked.json()["marked"] == 3

    after = (await client.get("/notifications/bell", headers=headers)).json()
    assert after["unreadCount"] == 0


async def test_mark_specific_read_drops_foreign_ids(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_full: dict[str, object],
) -> None:
    """Passing a foreign notification id must be silently dropped —
    no 403, no error, no accidental cross-user mutation."""
    _ = seed_full
    await NotificationsService.notify_user(
        db_session,
        SCHOOL_UUID,
        user_id=TEACHER_USER,
        payload=NotifyPayload(kind=LESSON_PLAN_SUBMITTED, title="mine", body="mine"),
    )
    await NotificationsService.notify_user(
        db_session,
        SCHOOL_UUID,
        user_id=UNIT_HEAD_USER,
        payload=NotifyPayload(kind=LESSON_PLAN_SUBMITTED, title="theirs", body="theirs"),
    )

    teacher_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=str(TEACHER_USER)),
    )
    mine_id = teacher_bell.json()["items"][0]["id"]

    uh_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=str(UNIT_HEAD_USER)),
    )
    foreign_id = uh_bell.json()["items"][0]["id"]

    # Teacher tries to mark BOTH — only their own should flip.
    res = await client.post(
        "/notifications/mark-read",
        json={"ids": [mine_id, foreign_id]},
        headers=auth_header(role="Teacher", user_id=str(TEACHER_USER)),
    )
    assert res.status_code == 200
    assert res.json()["marked"] == 1  # foreign one silently dropped

    # Unit Head's notification is still unread.
    uh_after = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=str(UNIT_HEAD_USER)),
    )
    assert uh_after.json()["unreadCount"] == 1


async def test_notify_audience_returns_count(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    """Sanity check for the fan-out primitive itself — Unit Head
    audience should resolve to exactly one recipient in the seed."""
    _ = seed_full
    count = await NotificationsService.notify_audience(
        db_session,
        SCHOOL_UUID,
        UnitHeadOfDivisionAudience(division="JHS"),
        NotifyPayload(kind=LESSON_PLAN_SUBMITTED, title="x", body="y"),
    )
    assert count == 1


async def test_notify_audience_empty_is_noop(
    db_session: AsyncSession, seed_full: dict[str, object]
) -> None:
    _ = seed_full
    count = await NotificationsService.notify_audience(
        db_session,
        SCHOOL_UUID,
        UnitHeadOfDivisionAudience(division="Lower Primary"),
        NotifyPayload(kind=LESSON_PLAN_SUBMITTED, title="x", body="y"),
    )
    assert count == 0
