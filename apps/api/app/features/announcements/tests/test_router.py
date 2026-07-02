"""Router tests for the Announcements API.

Coverage groups:
  1. Create — role gates per audience type (all / division / class)
  2. List — role-filtered visibility
  3. Notification fan-out on post (integration with NotificationsService)
  4. Delete — author + Admin only
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.features.announcements.tests.conftest import (
    ADMIN_USER,
    CLASS_JHS1_UUID,
    DEPUTY_JHS_STAFF,
    DEPUTY_JHS_USER,
    DEPUTY_KG_STAFF,
    DEPUTY_KG_USER,
    GUARDIAN_UUID,
    PARENT_USER,
    TEACHER_JHS_STAFF,
    TEACHER_JHS_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


# ─── Create role gates ──────────────────────────────────────────────────────


async def test_admin_can_post_school_wide(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "School closed Friday",
            "body": "Details inside.",
            "audience": "all",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text
    assert res.json()["audience"] == "all"


async def test_deputy_cannot_post_school_wide(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={"title": "x", "body": "y", "audience": "all", "isCritical": False},
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    # ConflictError → 409 (not 403 — matches the TS ActionResult{success:false}
    # error path where "you can't do this" is a domain-level failure).
    assert res.status_code == 409


async def test_deputy_posts_own_division_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "JHS assembly",
            "body": "Details.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert res.status_code == 201, res.text


async def test_deputy_cannot_post_other_division(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "JHS assembly",
            "body": "Details.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_KG_USER, linked_id=DEPUTY_KG_STAFF),
    )
    assert res.status_code == 409


async def test_teacher_cannot_post_class(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "test",
            "body": "test",
            "audience": f"class:{CLASS_JHS1_UUID}",
            "isCritical": False,
        },
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    assert res.status_code == 409


# ─── List visibility ────────────────────────────────────────────────────────


async def _post_all(client: AsyncClient) -> None:
    await client.post(
        "/announcements",
        json={"title": "all", "body": "all", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )


async def _post_division(client: AsyncClient, division: str) -> None:
    await client.post(
        "/announcements",
        json={
            "title": f"div-{division}",
            "body": "x",
            "audience": f"division:{division}",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )


async def test_teacher_sees_all_and_own_division(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-JHS"}


async def test_deputy_kg_only_sees_own_division_and_all(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_KG_USER, linked_id=DEPUTY_KG_STAFF),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-KG"}


async def test_parent_sees_all_and_child_division(client: AsyncClient, seed: None) -> None:
    """The seeded parent has a JHS 1 kid → they see `all` + `division:JHS`
    but not `division:KG`."""
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-JHS"}


# ─── Notification fan-out on post ───────────────────────────────────────────


async def test_school_wide_post_notifies_school(client: AsyncClient, seed: None) -> None:
    """Post a school-wide announcement; parent's bell should show it."""
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "School closed",
            "body": "Public holiday.",
            "audience": "all",
            "isCritical": True,
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    body = bell.json()
    assert body["unreadCount"] >= 1
    # `⚠` prefix comes from is_critical.
    assert any("School closed" in item["title"] for item in body["items"])


async def test_division_post_notifies_staff_and_parents(client: AsyncClient, seed: None) -> None:
    """`division:JHS` should reach the JHS Deputy + parents of JHS
    students — the KG Deputy should NOT see it."""
    _ = seed
    await client.post(
        "/announcements",
        json={
            "title": "JHS PTA",
            "body": "Come.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )

    jhs_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert any(item["title"] == "JHS PTA" for item in jhs_bell.json()["items"])

    parent_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    assert any(item["title"] == "JHS PTA" for item in parent_bell.json()["items"])

    kg_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_KG_USER,
            linked_id=DEPUTY_KG_STAFF,
        ),
    )
    assert not any(item["title"] == "JHS PTA" for item in kg_bell.json()["items"])


# ─── Delete ─────────────────────────────────────────────────────────────────


async def test_admin_can_delete_any(client: AsyncClient, seed: None) -> None:
    _ = seed
    create = await client.post(
        "/announcements",
        json={
            "title": "By DH",
            "body": "x",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    ann_id = create.json()["id"]

    delete = await client.delete(
        f"/announcements/{ann_id}",
        headers=auth_header(role="Admin", user_id=ADMIN_USER),
    )
    assert delete.status_code == 204


async def test_non_author_non_admin_cannot_delete(client: AsyncClient, seed: None) -> None:
    _ = seed
    create = await client.post(
        "/announcements",
        json={"title": "By Admin", "body": "x", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )
    ann_id = create.json()["id"]

    delete = await client.delete(
        f"/announcements/{ann_id}",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert delete.status_code == 403
