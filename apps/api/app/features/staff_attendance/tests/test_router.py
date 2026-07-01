"""HTTP-level tests for /staff-attendance/sessions."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.staff_attendance.tests.conftest import (
    STAFF_A_UUID,
    STAFF_B_UUID,
    auth_header,
)


def _payload(status_a: str = "Present", status_b: str = "Absent") -> dict[str, Any]:
    return {
        "division": "JHS",
        "date": "2026-01-15",
        "term": 2,
        "records": [
            {"staffId": str(STAFF_A_UUID), "status": status_a},
            {"staffId": str(STAFF_B_UUID), "status": status_b, "note": "Sick"},
        ],
    }


async def test_upsert_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/staff-attendance/sessions", json=_payload())
    assert res.status_code == 401


async def test_upsert_forbidden_for_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_jhs_staff: tuple[Staff, Staff],
) -> None:
    _ = (seed_school, seed_jhs_staff)
    for role in ("Teacher", "Parent", "Accountant"):
        res = await client.post(
            "/staff-attendance/sessions",
            json=_payload(),
            headers=auth_header(role=role),
        )
        assert res.status_code == 403, role


async def test_upsert_ok_for_deputy(
    client: AsyncClient,
    seed_school: School,
    seed_jhs_staff: tuple[Staff, Staff],
) -> None:
    _ = (seed_school, seed_jhs_staff)
    res = await client.post(
        "/staff-attendance/sessions",
        json=_payload(),
        headers=auth_header(role="DeputyHead"),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["division"] == "JHS"
    assert len(body["records"]) == 2
    assert body["records"][0]["staffLastName"] == "Boateng"


async def test_upsert_rejects_staff_outside_division(
    client: AsyncClient,
    seed_school: School,
    seed_jhs_staff: tuple[Staff, Staff],
) -> None:
    _ = (seed_school, seed_jhs_staff)
    bad = _payload()
    bad["records"].append({"staffId": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "status": "Present"})
    res = await client.post(
        "/staff-attendance/sessions", json=bad, headers=auth_header(role="Admin")
    )
    assert res.status_code == 400


async def test_upsert_is_idempotent(
    client: AsyncClient,
    seed_school: School,
    seed_jhs_staff: tuple[Staff, Staff],
) -> None:
    _ = (seed_school, seed_jhs_staff)
    first = await client.post(
        "/staff-attendance/sessions",
        json=_payload(),
        headers=auth_header(role="Admin"),
    )
    first_id = first.json()["id"]
    second = await client.post(
        "/staff-attendance/sessions",
        json=_payload(status_a="Absent", status_b="Present"),
        headers=auth_header(role="Admin"),
    )
    assert second.json()["id"] == first_id
    statuses = {r["staffLastName"]: r["status"] for r in second.json()["records"]}
    assert statuses == {"Owusu": "Absent", "Boateng": "Present"}


async def test_lookup_and_get_by_id(
    client: AsyncClient,
    seed_school: School,
    seed_jhs_staff: tuple[Staff, Staff],
) -> None:
    _ = (seed_school, seed_jhs_staff)
    created = (
        await client.post(
            "/staff-attendance/sessions",
            json=_payload(),
            headers=auth_header(role="Admin"),
        )
    ).json()
    lookup = await client.get(
        "/staff-attendance/sessions/lookup?division=JHS&date=2026-01-15",
        headers=auth_header(role="Teacher"),
    )
    assert lookup.status_code == 200
    assert lookup.json()["id"] == created["id"]

    detail = await client.get(
        f"/staff-attendance/sessions/{created['id']}",
        headers=auth_header(role="Teacher"),
    )
    assert detail.status_code == 200
    assert len(detail.json()["records"]) == 2
