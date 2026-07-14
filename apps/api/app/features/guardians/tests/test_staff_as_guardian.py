"""HTTP tests for staff-as-guardian: tagging a guardian with `staffId`,
find-or-reuse on re-pick, the staff-specific dedupe-conflict message, and
the `GET /guardians?staffId=` existence check.

Guardian creation goes through the student-scoped
`POST /students/{id}/guardians` flow (`newGuardian` branch) since the
standalone `POST /guardians` was removed as dead code — this exercises
the exact same `GuardiansService.create` staff-id find-or-create logic
`addGuardian` calls into.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.guardians.tests.conftest import SCHOOL_UUID, auth_header
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student

STAFF_UUID = UUID("44444444-4444-4444-8444-444444444901")
OTHER_STAFF_UUID = UUID("44444444-4444-4444-8444-444444444902")
UNKNOWN_STAFF_UUID = UUID("44444444-4444-4444-8444-444444444906")
UNRELATED_GUARDIAN_UUID = UUID("44444444-4444-4444-8444-444444444903")
STUDENT_UUID = UUID("44444444-4444-4444-8444-444444444904")
STUDENT2_UUID = UUID("44444444-4444-4444-8444-444444444905")


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> None:
    _ = seed_school
    db_session.add_all(
        [
            Staff(
                id=STAFF_UUID,
                slug="STAFF-SAG-1",
                school_id=SCHOOL_UUID,
                first_name="Kwame",
                last_name="Boateng",
                system_role="Teacher",
                division="JHS",
                phone="+233241000001",
                email="kwame.staff@example.com",
                is_active=True,
            ),
            Staff(
                id=OTHER_STAFF_UUID,
                slug="STAFF-SAG-2",
                school_id=SCHOOL_UUID,
                first_name="Yaa",
                last_name="Owusu",
                system_role="Teacher",
                division="KG",
                phone="+233241000002",
                email="yaa.staff@example.com",
                is_active=True,
            ),
            Student(
                id=STUDENT_UUID,
                slug="STU-SAG-1",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Child",
                is_active=True,
            ),
            Student(
                id=STUDENT2_UUID,
                slug="STU-SAG-2",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Child",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()


def _staff_guardian_body(
    phone: str = "+233241000001", staff_id: UUID = STAFF_UUID
) -> dict[str, Any]:
    return {
        "relation": "Father",
        "isPrimary": True,
        "newGuardian": {
            "firstName": "Kwame",
            "lastName": "Boateng",
            "phone": phone,
            "staffId": str(staff_id),
        },
    }


async def _add_guardian(client: AsyncClient, student_id: UUID, body: dict[str, Any]) -> Response:
    return await client.post(
        f"/students/{student_id}/guardians", json=body, headers=auth_header(role="Admin")
    )


async def test_create_tags_staff_id(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    res = await _add_guardian(client, STUDENT_UUID, _staff_guardian_body())
    assert res.status_code == 201, res.text
    linked = [g for g in res.json() if g["isStaff"]]
    assert len(linked) == 1

    found = await client.get(f"/guardians?staffId={STAFF_UUID}", headers=auth_header(role="Admin"))
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["id"] == linked[0]["id"]


async def test_repicking_same_staff_reuses_guardian(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    first = await _add_guardian(client, STUDENT_UUID, _staff_guardian_body())
    assert first.status_code == 201
    first_id = next(g["id"] for g in first.json() if g["isStaff"])

    # Re-picking the same staff member for a DIFFERENT student — even with
    # different typed-in contact info — must reuse the SAME guardian row,
    # not create a duplicate.
    second = await _add_guardian(client, STUDENT2_UUID, _staff_guardian_body(phone="+233241000009"))
    assert second.status_code == 201
    second_id = next(g["id"] for g in second.json() if g["isStaff"])
    assert second_id == first_id

    listed = await client.get("/guardians", headers=auth_header(role="Admin"))
    staff_backed = [g for g in listed.json()["items"] if g["staffId"] == str(STAFF_UUID)]
    assert len(staff_backed) == 1


async def test_unknown_staff_id_rejected(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    res = await _add_guardian(
        client, STUDENT_UUID, _staff_guardian_body(staff_id=UNKNOWN_STAFF_UUID)
    )
    assert res.status_code == 400


async def test_staff_contact_collision_gets_staff_specific_message(
    client: AsyncClient, db_session: AsyncSession, seed_school: School, seed_staff: None
) -> None:
    # An unrelated, pre-existing guardian already owns this phone number.
    db_session.add(
        Guardian(
            id=UNRELATED_GUARDIAN_UUID,
            slug="GRD-UNRELATED",
            school_id=SCHOOL_UUID,
            first_name="Someone",
            last_name="Else",
            phone="+233241000001",
        )
    )
    await db_session.flush()

    res = await _add_guardian(client, STUDENT_UUID, _staff_guardian_body())
    assert res.status_code == 409
    assert "already used by another guardian record" in res.json()["error"]["message"]


async def test_staff_id_filter_finds_existing_guardian(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    created = await _add_guardian(client, STUDENT_UUID, _staff_guardian_body())
    assert created.status_code == 201
    created_id = next(g["id"] for g in created.json() if g["isStaff"])

    found = await client.get(f"/guardians?staffId={STAFF_UUID}", headers=auth_header(role="Admin"))
    assert found.status_code == 200
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["id"] == created_id

    empty = await client.get(
        f"/guardians?staffId={OTHER_STAFF_UUID}", headers=auth_header(role="Admin")
    )
    assert empty.status_code == 200
    assert empty.json()["total"] == 0
