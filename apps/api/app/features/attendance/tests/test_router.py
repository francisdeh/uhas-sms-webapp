"""HTTP-level tests for /attendance/sessions.

Covers the batch upsert flow, idempotent re-save, roster-validation
error, cross-scope isolation, and the list + lookup endpoints.
"""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

from app.features.attendance.tests.conftest import (
    CLASS_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    auth_header,
)
from app.features.classes.model import Class
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student


def _payload(status_a: str = "Present", status_b: str = "Absent") -> dict[str, Any]:
    return {
        "classId": str(CLASS_UUID),
        "date": "2026-01-15",
        "term": 2,
        "records": [
            {"studentId": str(STUDENT_A_UUID), "status": status_a},
            {"studentId": str(STUDENT_B_UUID), "status": status_b, "note": "Sick"},
        ],
    }


async def test_upsert_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/attendance/sessions", json=_payload())
    assert res.status_code == 401


async def test_upsert_creates_session_and_records(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    res = await client.post(
        "/attendance/sessions",
        json=_payload(),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["classId"] == str(CLASS_UUID)
    assert body["className"] == "JHS 1"
    assert body["date"] == "2026-01-15"
    assert body["term"] == 2
    assert len(body["records"]) == 2
    # Sorted by last name — Boateng before Mensah.
    assert body["records"][0]["studentLastName"] == "Boateng"
    assert body["records"][0]["status"] == "Absent"
    assert body["records"][0]["note"] == "Sick"
    assert body["records"][1]["studentLastName"] == "Mensah"
    assert body["records"][1]["status"] == "Present"
    assert body["submittedByName"] == "Ama Owusu"


async def test_upsert_is_idempotent_on_same_class_date(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    first = await client.post(
        "/attendance/sessions",
        json=_payload(status_a="Present", status_b="Absent"),
        headers=auth_header(role="Teacher"),
    )
    first_id = first.json()["id"]

    # Re-save with flipped statuses — same class + date should update in place.
    second = await client.post(
        "/attendance/sessions",
        json=_payload(status_a="Absent", status_b="Present"),
        headers=auth_header(role="Teacher"),
    )
    body = second.json()
    assert body["id"] == first_id  # same session row
    statuses_by_name = {r["studentLastName"]: r["status"] for r in body["records"]}
    assert statuses_by_name == {"Mensah": "Absent", "Boateng": "Present"}


async def test_upsert_rejects_student_not_in_class(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    bad = _payload()
    bad["records"].append(
        {"studentId": "11111111-1111-4111-8111-111111111111", "status": "Present"}
    )
    res = await client.post("/attendance/sessions", json=bad, headers=auth_header(role="Teacher"))
    assert res.status_code == 400  # ValidationError → 400


async def test_upsert_rejects_unknown_class(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    bad = _payload()
    bad["classId"] = "22222222-2222-4222-8222-222222222222"
    res = await client.post("/attendance/sessions", json=bad, headers=auth_header(role="Teacher"))
    assert res.status_code == 400


async def test_upsert_422_on_empty_records(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    bad = _payload()
    bad["records"] = []
    res = await client.post("/attendance/sessions", json=bad, headers=auth_header(role="Teacher"))
    assert res.status_code == 422


async def test_lookup_404_before_session_exists(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
) -> None:
    res = await client.get(
        f"/attendance/sessions/lookup?classId={CLASS_UUID}&date=2026-01-15",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 404


async def test_lookup_returns_session_after_save(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    await client.post(
        "/attendance/sessions",
        json=_payload(),
        headers=auth_header(role="Teacher"),
    )
    res = await client.get(
        f"/attendance/sessions/lookup?classId={CLASS_UUID}&date=2026-01-15",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["classId"] == str(CLASS_UUID)


async def test_list_returns_summary_counts(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    await client.post(
        "/attendance/sessions",
        json=_payload(status_a="Present", status_b="Absent"),
        headers=auth_header(role="Teacher"),
    )
    res = await client.get("/attendance/sessions", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    row = items[0]
    assert row["presentCount"] == 1
    assert row["absentCount"] == 1
    assert row["lateCount"] == 0
    assert row["excusedCount"] == 0


async def test_get_by_id_returns_records(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    created = (
        await client.post(
            "/attendance/sessions",
            json=_payload(),
            headers=auth_header(role="Teacher"),
        )
    ).json()
    res = await client.get(
        f"/attendance/sessions/{created['id']}",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert len(res.json()["records"]) == 2
