"""Router tests for the audit-log read endpoint.

Coverage:
  1. Admin-only auth gate
  2. Empty list when nothing is logged
  3. Action filter narrows the set
  4. Date-range filter (`from`/`to` inclusive bounds)
  5. Newest-first ordering
  6. Actor name resolution (staff-linked → "First Last", unlinked → email)
"""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.actions import (
    PROMOTION_APPROVED,
    SCHOOL_SETTINGS_UPDATE,
    SCORE_OVERRIDE,
)
from app.features.audit.service import write_audit_log
from app.features.audit.tests.conftest import (
    ADMIN_USER,
    EMAIL_ONLY_USER,
    SCHOOL_UUID,
    TEACHER_STAFF,
    TEACHER_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


async def _write(
    db_session: AsyncSession,
    action: str,
    *,
    user_id: UUID = ADMIN_USER,
    at: datetime | None = None,
) -> None:
    """Write one audit row. Overrides `created_at` when the test needs a
    specific timestamp — DB default is `now()`."""
    row = await write_audit_log(
        db_session,
        school_id=SCHOOL_UUID,
        user_id=user_id,
        action=action,  # type: ignore[arg-type]
        target_table="test",
        target_id=None,
        after={"detail": action},
    )
    if at is not None:
        row.created_at = at
        await db_session.flush()


# ─── Auth gate ─────────────────────────────────────────────────────────────


async def test_teacher_cannot_read(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/audit-log",
        headers=auth_header(
            role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF
        ),
    )
    assert res.status_code == 403


async def test_deputy_cannot_read(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/audit-log",
        headers=auth_header(
            role="DeputyHead", user_id=ADMIN_USER, linked_id=None
        ),
    )
    assert res.status_code == 403


async def test_empty_list(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get("/audit-log", headers=auth_header())
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["items"] == []


# ─── Filtering ─────────────────────────────────────────────────────────────


async def test_action_filter(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    await _write(db_session, SCHOOL_SETTINGS_UPDATE)
    await _write(db_session, SCORE_OVERRIDE)
    await _write(db_session, PROMOTION_APPROVED)

    res = await client.get(
        "/audit-log?action=SCORE_OVERRIDE", headers=auth_header()
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["action"] == "SCORE_OVERRIDE"


async def test_from_filter_lower_bound_inclusive(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    """`from=2026-05-15` should include rows dated 2026-05-15T00:00:01."""
    _ = seed
    await _write(
        db_session,
        SCORE_OVERRIDE,
        at=datetime(2026, 5, 14, 23, 59, 59),  # before the from-bound
    )
    await _write(
        db_session,
        SCORE_OVERRIDE,
        at=datetime(2026, 5, 15, 0, 0, 1),  # on the from-bound
    )

    res = await client.get(
        "/audit-log?from=2026-05-15", headers=auth_header()
    )
    assert res.json()["total"] == 1


async def test_to_filter_upper_bound_inclusive(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    """`to=2026-05-15` should include rows dated 2026-05-15T23:59:59."""
    _ = seed
    await _write(
        db_session,
        SCORE_OVERRIDE,
        at=datetime(2026, 5, 15, 23, 59, 59),
    )
    await _write(
        db_session,
        SCORE_OVERRIDE,
        at=datetime(2026, 5, 16, 0, 0, 1),
    )

    res = await client.get(
        "/audit-log?to=2026-05-15", headers=auth_header()
    )
    assert res.json()["total"] == 1


# ─── Ordering ──────────────────────────────────────────────────────────────


async def test_newest_first(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    now = datetime.now().replace(microsecond=0)
    await _write(db_session, SCORE_OVERRIDE, at=now - timedelta(hours=2))
    await _write(db_session, SCHOOL_SETTINGS_UPDATE, at=now - timedelta(hours=1))
    await _write(db_session, PROMOTION_APPROVED, at=now)

    res = await client.get("/audit-log", headers=auth_header())
    actions = [item["action"] for item in res.json()["items"]]
    assert actions == [
        "PROMOTION_APPROVED",
        "SCHOOL_SETTINGS_UPDATE",
        "SCORE_OVERRIDE",
    ]


# ─── Actor name resolution ────────────────────────────────────────────────


async def test_actor_name_uses_linked_staff(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    """User linked to a staff row → "First Last"."""
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER)
    res = await client.get("/audit-log", headers=auth_header())
    assert res.json()["items"][0]["actorName"] == "Adae Admin"


async def test_actor_name_falls_back_to_email(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    """User with no linked staff row → email."""
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=EMAIL_ONLY_USER)
    res = await client.get("/audit-log", headers=auth_header())
    assert res.json()["items"][0]["actorName"] == "unlinked@audit.test"


async def test_unknown_user_actor_name_is_null(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    """User id that doesn't exist in `users` at all → `actorName: null`.
    The FE renders that as "Unknown user"."""
    _ = seed
    unknown_uuid = UUID("00000000-0000-4000-8000-000000000042")
    await _write(db_session, SCORE_OVERRIDE, user_id=unknown_uuid)
    res = await client.get("/audit-log", headers=auth_header())
    assert res.json()["items"][0]["actorName"] is None


# ─── Pagination ────────────────────────────────────────────────────────────


async def test_pagination_respects_size(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    now = datetime.now().replace(microsecond=0)
    for i in range(5):
        await _write(db_session, SCORE_OVERRIDE, at=now - timedelta(seconds=i))

    res = await client.get("/audit-log?size=2&page=1", headers=auth_header())
    body = res.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2

    res_page2 = await client.get(
        "/audit-log?size=2&page=2", headers=auth_header()
    )
    assert len(res_page2.json()["items"]) == 2
    # Page 2 rows shouldn't overlap page 1.
    ids_1 = {i["id"] for i in body["items"]}
    ids_2 = {i["id"] for i in res_page2.json()["items"]}
    assert ids_1.isdisjoint(ids_2)
