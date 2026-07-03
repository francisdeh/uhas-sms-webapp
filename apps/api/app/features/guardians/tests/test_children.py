"""HTTP-level tests for `GET /guardians/{id}/children`."""

from __future__ import annotations

from httpx import AsyncClient

from app.features.guardians.tests.conftest import (
    CLASS_UUID,
    GUARDIAN_A_UUID,
    GUARDIAN_B_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    auth_header,
)


async def test_requires_auth(client: AsyncClient, seed_children: None) -> None:
    res = await client.get(f"/guardians/{GUARDIAN_A_UUID}/children")
    assert res.status_code == 401


async def test_admin_can_view_any_guardians_children(
    client: AsyncClient, seed_children: None
) -> None:
    res = await client.get(
        f"/guardians/{GUARDIAN_A_UUID}/children", headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(STUDENT_A_UUID)
    assert items[0]["classId"] == str(CLASS_UUID)
    assert items[0]["className"] == "JHS 1"


async def test_unenrolled_child_has_null_class(client: AsyncClient, seed_children: None) -> None:
    res = await client.get(
        f"/guardians/{GUARDIAN_B_UUID}/children", headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(STUDENT_B_UUID)
    assert items[0]["classId"] is None


async def test_parent_can_view_own_children(client: AsyncClient, seed_children: None) -> None:
    res = await client.get(
        f"/guardians/{GUARDIAN_A_UUID}/children",
        headers=auth_header(role="Parent", linked_id=GUARDIAN_A_UUID),
    )
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


async def test_parent_cannot_view_other_guardians_children(
    client: AsyncClient, seed_children: None
) -> None:
    res = await client.get(
        f"/guardians/{GUARDIAN_B_UUID}/children",
        headers=auth_header(role="Parent", linked_id=GUARDIAN_A_UUID),
    )
    assert res.status_code == 403


async def test_teacher_can_view_any_guardians_children(
    client: AsyncClient, seed_children: None
) -> None:
    res = await client.get(
        f"/guardians/{GUARDIAN_A_UUID}/children", headers=auth_header(role="Teacher")
    )
    assert res.status_code == 200


async def test_guardian_with_no_children_returns_empty_list(
    client: AsyncClient, seed_children: None
) -> None:
    other = "44444444-4444-4444-8444-444444444799"
    res = await client.get(f"/guardians/{other}/children", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert res.json()["items"] == []
