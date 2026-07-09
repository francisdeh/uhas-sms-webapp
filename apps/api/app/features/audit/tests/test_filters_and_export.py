"""Tests for the audit-log's user/target filters, the actor dropdown,
and CSV export — Phase 6 item 2 ("cheap admin win")."""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.actions import PROMOTION_APPROVED, SCHOOL_SETTINGS_UPDATE, SCORE_OVERRIDE
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

TARGET_A = UUID("77777777-7777-4777-8777-777777770501")
TARGET_B = UUID("77777777-7777-4777-8777-777777770502")


async def _write(
    db_session: AsyncSession,
    action: str,
    *,
    user_id: UUID = ADMIN_USER,
    target_table: str | None = "test",
    target_id: UUID | None = None,
    at: datetime | None = None,
) -> None:
    row = await write_audit_log(
        db_session,
        school_id=SCHOOL_UUID,
        user_id=user_id,
        action=action,  # type: ignore[arg-type]
        target_table=target_table,
        target_id=target_id,
        after={"detail": action},
    )
    if at is not None:
        row.created_at = at
        await db_session.flush()


# ─── user/target filters ────────────────────────────────────────────────────


async def test_user_id_filter(client: AsyncClient, db_session: AsyncSession, seed: None) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER)
    await _write(db_session, SCORE_OVERRIDE, user_id=EMAIL_ONLY_USER)

    res = await client.get(f"/audit-log?userId={ADMIN_USER}", headers=auth_header())
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["userId"] == str(ADMIN_USER)


async def test_target_table_filter(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, target_table="scores")
    await _write(db_session, SCHOOL_SETTINGS_UPDATE, target_table="schools")

    res = await client.get("/audit-log?targetTable=scores", headers=auth_header())
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["targetTable"] == "scores"


async def test_target_id_filter(client: AsyncClient, db_session: AsyncSession, seed: None) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, target_table="scores", target_id=TARGET_A)
    await _write(db_session, SCORE_OVERRIDE, target_table="scores", target_id=TARGET_B)

    res = await client.get(f"/audit-log?targetId={TARGET_A}", headers=auth_header())
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["targetId"] == str(TARGET_A)


async def test_filters_combine(client: AsyncClient, db_session: AsyncSession, seed: None) -> None:
    """user + target_table together narrow further than either alone."""
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER, target_table="scores")
    await _write(db_session, SCORE_OVERRIDE, user_id=EMAIL_ONLY_USER, target_table="scores")
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER, target_table="schools")

    res = await client.get(
        f"/audit-log?userId={ADMIN_USER}&targetTable=scores", headers=auth_header()
    )
    assert res.json()["total"] == 1


# ─── actors dropdown ─────────────────────────────────────────────────────────


async def test_actors_excludes_teacher_role(client: AsyncClient, seed: None) -> None:
    """Non-Admin still can't read the audit surface."""
    _ = seed
    res = await client.get(
        "/audit-log/actors",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 403


async def test_actors_lists_only_users_who_appear_in_the_log(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER)
    await _write(db_session, SCHOOL_SETTINGS_UPDATE, user_id=EMAIL_ONLY_USER)
    # TEACHER_USER never writes a row — must not appear.

    res = await client.get("/audit-log/actors", headers=auth_header())
    assert res.status_code == 200
    ids = {a["userId"] for a in res.json()}
    assert ids == {str(ADMIN_USER), str(EMAIL_ONLY_USER)}


async def test_actors_resolve_display_names(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE, user_id=ADMIN_USER)
    res = await client.get("/audit-log/actors", headers=auth_header())
    names = {a["userId"]: a["name"] for a in res.json()}
    assert names[str(ADMIN_USER)] == "Adae Admin"


# ─── CSV export ──────────────────────────────────────────────────────────────


async def test_export_requires_admin(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        "/audit-log/export",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 403


async def test_export_returns_csv_with_all_matching_rows(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    now = datetime.now().replace(microsecond=0)
    for i in range(3):
        await _write(db_session, SCORE_OVERRIDE, at=now - timedelta(seconds=i))

    res = await client.get("/audit-log/export", headers=auth_header())
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment" in res.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(res.text)))
    assert rows[0] == ["Date/Time", "Actor", "Action", "Target Table", "Target ID"]
    assert len(rows) == 4  # header + 3 rows
    assert all(r[1] == "Adae Admin" for r in rows[1:])


async def test_export_respects_filters(
    client: AsyncClient, db_session: AsyncSession, seed: None
) -> None:
    _ = seed
    await _write(db_session, SCORE_OVERRIDE)
    await _write(db_session, PROMOTION_APPROVED)

    res = await client.get("/audit-log/export?action=SCORE_OVERRIDE", headers=auth_header())
    rows = list(csv.reader(io.StringIO(res.text)))
    assert len(rows) == 2  # header + 1 matching row
    assert rows[1][2] == "SCORE_OVERRIDE"
