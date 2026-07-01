"""HTTP-level tests for /subjects."""

from __future__ import annotations

from httpx import AsyncClient

from app.features.schools.model import School
from app.features.subjects.tests.conftest import OTHER_SCHOOL_UUID, SCHOOL_UUID, auth_header

_BODY = {"slug": "math", "name": "Mathematics", "division": "JHS", "category": "Core"}


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/subjects")
    assert res.status_code == 401


async def test_create_requires_admin(client: AsyncClient, seed_school: School) -> None:
    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.post("/subjects", json=_BODY, headers=auth_header(role=role))
        assert res.status_code == 403


async def test_create_uppercases_slug(client: AsyncClient, seed_school: School) -> None:
    res = await client.post("/subjects", json=_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    assert res.json()["slug"] == "MATH"  # canonical


async def test_create_409_on_duplicate_slug(client: AsyncClient, seed_school: School) -> None:
    await client.post("/subjects", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.post(
        "/subjects",
        json={**_BODY, "name": "Math Extended"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_filter_by_division(client: AsyncClient, seed_school: School) -> None:
    await client.post("/subjects", json=_BODY, headers=auth_header(role="Admin"))
    await client.post(
        "/subjects",
        json={"slug": "eng", "name": "English", "division": "KG", "category": "Core"},
        headers=auth_header(role="Admin"),
    )
    jhs = await client.get("/subjects?division=JHS", headers=auth_header(role="Admin"))
    assert len(jhs.json()["items"]) == 1
    assert jhs.json()["items"][0]["slug"] == "MATH"


async def test_search_by_q(client: AsyncClient, seed_school: School) -> None:
    await client.post("/subjects", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.get("/subjects?q=math", headers=auth_header(role="Admin"))
    assert len(res.json()["items"]) == 1


async def test_patch_updates_name(client: AsyncClient, seed_school: School) -> None:
    created = (await client.post("/subjects", json=_BODY, headers=auth_header(role="Admin"))).json()
    res = await client.patch(
        f"/subjects/{created['id']}",
        json={"name": "Mathematics (Renamed)"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["name"] == "Mathematics (Renamed)"


async def test_cross_school_scoping(client: AsyncClient, seed_school: School) -> None:
    await client.post(
        "/subjects",
        json=_BODY,
        headers=auth_header(role="Admin", school_id=SCHOOL_UUID),
    )
    res = await client.get(
        "/subjects", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res.status_code == 200
    assert res.json()["items"] == []
