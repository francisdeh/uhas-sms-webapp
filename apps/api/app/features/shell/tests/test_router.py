"""Tests for `GET /shell/nav-badges`.

Covers the two branches that actually count (Unit Head + Deputy Head)
plus the three that short-circuit to zero (Admin, non-Unit-Head Teacher,
Parent) and the auth gate.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.shell.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    CLASS_JHS_UUID,
    CLASS_KG_UUID,
    DEPUTY_STAFF,
    DEPUTY_USER,
    GUARDIAN_UUID,
    PARENT_USER,
    SUBMITTED_STATUS,
    TEACHER_STAFF,
    TEACHER_USER,
    UNIT_HEAD_APPROVED_STATUS,
    UNIT_HEAD_STAFF,
    UNIT_HEAD_USER,
    add_lesson_plan,
    auth_header,
)


async def test_unit_head_sees_only_own_division_submitted(
    client: AsyncClient, seed: None, db_session: AsyncSession
) -> None:
    # 3 JHS submitted (Unit Head's division) — counted.
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=1)
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=2)
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=3)
    # 1 KG submitted — different division, ignored.
    await add_lesson_plan(db_session, class_id=CLASS_KG_UUID, status=SUBMITTED_STATUS, week=1)
    # 1 JHS but already unit-head-approved — past this Unit Head's queue.
    await add_lesson_plan(
        db_session, class_id=CLASS_JHS_UUID, status=UNIT_HEAD_APPROVED_STATUS, week=4
    )

    r = await client.get(
        "/shell/nav-badges",
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"lessonPlansPendingReview": 3}


async def test_deputy_head_sees_only_unit_head_approved_own_division(
    client: AsyncClient, seed: None, db_session: AsyncSession
) -> None:
    # 2 JHS unit-head-approved (Deputy's division) — counted.
    await add_lesson_plan(
        db_session, class_id=CLASS_JHS_UUID, status=UNIT_HEAD_APPROVED_STATUS, week=1
    )
    await add_lesson_plan(
        db_session, class_id=CLASS_JHS_UUID, status=UNIT_HEAD_APPROVED_STATUS, week=2
    )
    # 1 JHS still submitted (Unit Head hasn't signed) — Deputy shouldn't see it.
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=3)
    # 1 KG unit-head-approved — different division, ignored.
    await add_lesson_plan(
        db_session, class_id=CLASS_KG_UUID, status=UNIT_HEAD_APPROVED_STATUS, week=1
    )

    r = await client.get(
        "/shell/nav-badges",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=DEPUTY_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"lessonPlansPendingReview": 2}


async def test_teacher_without_unit_head_flag_gets_zero(
    client: AsyncClient, seed: None, db_session: AsyncSession
) -> None:
    # Seed plans in the Teacher's own division — must NOT count.
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=1)
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=2)

    r = await client.get(
        "/shell/nav-badges",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"lessonPlansPendingReview": 0}


async def test_admin_gets_zero(client: AsyncClient, seed: None, db_session: AsyncSession) -> None:
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=1)
    await add_lesson_plan(
        db_session, class_id=CLASS_JHS_UUID, status=UNIT_HEAD_APPROVED_STATUS, week=2
    )

    r = await client.get(
        "/shell/nav-badges",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"lessonPlansPendingReview": 0}


async def test_parent_gets_zero(client: AsyncClient, seed: None, db_session: AsyncSession) -> None:
    await add_lesson_plan(db_session, class_id=CLASS_JHS_UUID, status=SUBMITTED_STATUS, week=1)

    r = await client.get(
        "/shell/nav-badges",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    assert r.status_code == 200
    assert r.json() == {"lessonPlansPendingReview": 0}


async def test_missing_auth_header_returns_401(client: AsyncClient, seed: None) -> None:
    r = await client.get("/shell/nav-badges")
    assert r.status_code == 401
