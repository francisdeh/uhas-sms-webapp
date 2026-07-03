"""Router tests for the Calendar API — Admin-only mutations + date
validation."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.features.calendar.tests.conftest import (
    TEACHER_STAFF,
    auth_header,
)

pytestmark = pytest.mark.asyncio


async def test_admin_can_create_event(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/calendar",
        json={
            "title": "Term 2 starts",
            "startDate": "2026-01-06",
            "type": "term_start",
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["title"] == "Term 2 starts"
    assert body["type"] == "term_start"
    assert body["endDate"] is None


async def test_non_admin_cannot_create(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/calendar",
        json={
            "title": "Sports Day",
            "startDate": "2026-02-10",
            "type": "event",
        },
        headers=auth_header(role="Teacher", linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 403


async def test_create_rejects_end_before_start(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/calendar",
        json={
            "title": "Bad range",
            "startDate": "2026-03-10",
            "endDate": "2026-03-05",
            "type": "event",
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 400


async def test_list_returns_chronological(client: AsyncClient, seed: None) -> None:
    """Post out of order → list comes back start_date ascending."""
    _ = seed
    admin = auth_header(role="Admin")
    for title, start in [
        ("Later", "2026-05-01"),
        ("Earlier", "2026-01-06"),
        ("Middle", "2026-03-10"),
    ]:
        await client.post(
            "/calendar",
            json={"title": title, "startDate": start, "type": "event"},
            headers=admin,
        )

    res = await client.get(
        "/calendar",
        headers=auth_header(role="Teacher", linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 200
    titles = [item["title"] for item in res.json()["items"]]
    assert titles == ["Earlier", "Middle", "Later"]


async def test_teacher_can_read(client: AsyncClient, seed: None) -> None:
    """Any authenticated caller in the school can read — matches TS."""
    _ = seed
    await client.post(
        "/calendar",
        json={"title": "Public", "startDate": "2026-04-01", "type": "event"},
        headers=auth_header(role="Admin"),
    )
    res = await client.get(
        "/calendar", headers=auth_header(role="Teacher", linked_id=TEACHER_STAFF)
    )
    assert res.status_code == 200
    assert res.json()["total"] == 1


async def test_admin_can_delete(client: AsyncClient, seed: None) -> None:
    _ = seed
    admin = auth_header(role="Admin")
    create = await client.post(
        "/calendar",
        json={"title": "X", "startDate": "2026-04-01", "type": "event"},
        headers=admin,
    )
    event_id = create.json()["id"]
    delete = await client.delete(f"/calendar/{event_id}", headers=admin)
    assert delete.status_code == 204

    # And a follow-up list confirms it's gone.
    listing = await client.get("/calendar", headers=admin)
    assert listing.json()["total"] == 0


async def test_teacher_cannot_delete(client: AsyncClient, seed: None) -> None:
    _ = seed
    admin = auth_header(role="Admin")
    create = await client.post(
        "/calendar",
        json={"title": "X", "startDate": "2026-04-01", "type": "event"},
        headers=admin,
    )
    event_id = create.json()["id"]
    delete = await client.delete(
        f"/calendar/{event_id}",
        headers=auth_header(role="Teacher", linked_id=TEACHER_STAFF),
    )
    assert delete.status_code == 403
