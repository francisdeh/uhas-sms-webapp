"""HTTP-level tests for /staff endpoints."""

from __future__ import annotations

from httpx import AsyncClient

from app.features.schools.model import School
from app.features.staff.tests.conftest import OTHER_SCHOOL_UUID, SCHOOL_UUID, auth_header

_BODY = {
    "firstName": "Akua",
    "lastName": "Mensah",
    "rank": "Senior Teacher",
    "systemRole": "Teacher",
    "division": "JHS",
    "email": "akua@uhas.edu.gh",
    "phone": "+233241112233",
}


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/staff")
    assert res.status_code == 401


async def test_list_returns_empty_when_no_staff(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/staff", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert res.json() == {"items": [], "total": 0, "page": 1, "size": 50}


async def test_create_requires_admin(client: AsyncClient, seed_school: School) -> None:
    for role in ("Teacher", "Parent", "DeputyHead", "Accountant"):
        res = await client.post("/staff", json=_BODY, headers=auth_header(role=role))
        assert res.status_code == 403, f"role={role}"


async def test_create_round_trips_through_list(client: AsyncClient, seed_school: School) -> None:
    res = await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    created = res.json()
    assert created["slug"] == "STAFF-001"
    assert created["firstName"] == "Akua"

    listed = await client.get("/staff", headers=auth_header(role="Admin"))
    assert listed.status_code == 200
    items = listed.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == created["id"]


async def test_create_400_when_division_missing_for_teacher(
    client: AsyncClient, seed_school: School
) -> None:
    """ValidationError → 400 (per app/core/errors.py).

    A `division=None` body is well-formed JSON (so it isn't FastAPI's 422),
    but breaks our business invariant — the service raises ValidationError
    which the exception handler maps to 400.
    """
    bad = {**_BODY, "division": None, "email": "x@u.gh"}
    res = await client.post("/staff", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 400


async def test_create_409_on_duplicate_email(client: AsyncClient, seed_school: School) -> None:
    await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 409


async def test_search_filters_by_query(client: AsyncClient, seed_school: School) -> None:
    bodies = [
        {**_BODY, "firstName": "Akua", "lastName": "Mensah", "email": "akua@u.gh"},
        {**_BODY, "firstName": "Kojo", "lastName": "Boateng", "email": "kojo@u.gh"},
    ]
    for body in bodies:
        await client.post("/staff", json=body, headers=auth_header(role="Admin"))

    res = await client.get("/staff?q=akua", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["firstName"] == "Akua"


async def test_offset_pagination_advances_page(client: AsyncClient, seed_school: School) -> None:
    """3 rows, `size=2` → page 1 returns 2 rows, page 2 returns 1, total=3."""
    for i in range(3):
        await client.post(
            "/staff",
            json={**_BODY, "lastName": f"Last{i:02d}", "email": f"u{i}@u.gh"},
            headers=auth_header(role="Admin"),
        )

    page1 = (await client.get("/staff?page=1&size=2", headers=auth_header(role="Admin"))).json()
    assert len(page1["items"]) == 2
    assert page1["total"] == 3
    assert page1["page"] == 1
    assert page1["size"] == 2

    page2 = (await client.get("/staff?page=2&size=2", headers=auth_header(role="Admin"))).json()
    assert len(page2["items"]) == 1
    assert page2["total"] == 3
    assert page2["page"] == 2

    seen_ids = {i["id"] for i in page1["items"]} | {i["id"] for i in page2["items"]}
    assert len(seen_ids) == 3


async def test_active_only_filter(client: AsyncClient, seed_school: School) -> None:
    created = (await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))).json()
    # Deactivate via the dedicated endpoint.
    await client.post(f"/staff/{created['id']}/deactivate", headers=auth_header(role="Admin"))
    all_rows = (await client.get("/staff", headers=auth_header(role="Admin"))).json()
    active_rows = (
        await client.get("/staff?activeOnly=true", headers=auth_header(role="Admin"))
    ).json()
    assert len(all_rows["items"]) == 1
    assert len(active_rows["items"]) == 0


async def test_cross_school_scoping(
    client: AsyncClient,
    seed_school: School,
    db_session: object,
) -> None:
    # School A creates a staff row, School B can't see it.
    await client.post(
        "/staff", json=_BODY, headers=auth_header(role="Admin", school_id=SCHOOL_UUID)
    )
    res = await client.get("/staff", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID))
    assert res.status_code == 200
    assert res.json()["items"] == []


async def test_patch_updates_basic_fields(client: AsyncClient, seed_school: School) -> None:
    created = (await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))).json()
    patched = await client.patch(
        f"/staff/{created['id']}",
        json={"phone": "+233500000000"},
        headers=auth_header(role="Admin"),
    )
    assert patched.status_code == 200
    assert patched.json()["phone"] == "+233500000000"


async def test_role_change_endpoint(client: AsyncClient, seed_school: School) -> None:
    created = (await client.post("/staff", json=_BODY, headers=auth_header(role="Admin"))).json()
    res = await client.patch(
        f"/staff/{created['id']}/role",
        json={"systemRole": "Admin"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["systemRole"] == "Admin"
    assert res.json()["division"] is None


async def test_unit_head_endpoint_requires_teacher(
    client: AsyncClient, seed_school: School
) -> None:
    created = (
        await client.post(
            "/staff",
            json={**_BODY, "systemRole": "DeputyHead"},
            headers=auth_header(role="Admin"),
        )
    ).json()
    res = await client.patch(
        f"/staff/{created['id']}/unit-head",
        json={"isUnitHead": True, "unitHeadOf": "JHS"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 400  # ValidationError
