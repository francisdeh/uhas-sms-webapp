"""HTTP tests for staff-as-guardian: tagging a guardian with `staffId`,
find-or-reuse on re-pick, the staff-specific dedupe-conflict message, and
the `GET /guardians?staffId=` existence check.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.guardians.tests.conftest import SCHOOL_UUID, auth_header
from app.features.schools.model import School
from app.features.staff.model import Staff

STAFF_UUID = UUID("44444444-4444-4444-8444-444444444901")
OTHER_STAFF_UUID = UUID("44444444-4444-4444-8444-444444444902")
UNRELATED_GUARDIAN_UUID = UUID("44444444-4444-4444-8444-444444444903")


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
        ]
    )
    await db_session.flush()


def _staff_guardian_body(phone: str = "+233241000001") -> dict[str, Any]:
    return {
        "firstName": "Kwame",
        "lastName": "Boateng",
        "phone": phone,
        "staffId": str(STAFF_UUID),
    }


async def test_create_tags_staff_id(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    res = await client.post(
        "/guardians", json=_staff_guardian_body(), headers=auth_header(role="Admin")
    )
    assert res.status_code == 201, res.text
    assert res.json()["staffId"] == str(STAFF_UUID)


async def test_repicking_same_staff_reuses_guardian(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    first = await client.post(
        "/guardians", json=_staff_guardian_body(), headers=auth_header(role="Admin")
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    # Re-picking the same staff member — even with different typed-in
    # contact info — must return the SAME guardian row, not a duplicate.
    second = await client.post(
        "/guardians",
        json=_staff_guardian_body(phone="+233241000009"),
        headers=auth_header(role="Admin"),
    )
    assert second.status_code == 201
    assert second.json()["id"] == first_id

    listed = await client.get("/guardians", headers=auth_header(role="Admin"))
    staff_backed = [g for g in listed.json()["items"] if g["staffId"] == str(STAFF_UUID)]
    assert len(staff_backed) == 1


async def test_unknown_staff_id_rejected(client: AsyncClient, seed_school: School) -> None:
    res = await client.post(
        "/guardians",
        json={
            "firstName": "X",
            "lastName": "Y",
            "phone": "+233241000099",
            "staffId": str(STAFF_UUID),
        },
        headers=auth_header(role="Admin"),
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

    res = await client.post(
        "/guardians", json=_staff_guardian_body(), headers=auth_header(role="Admin")
    )
    assert res.status_code == 409
    assert "already used by another guardian record" in res.json()["error"]["message"]


async def test_staff_id_filter_finds_existing_guardian(
    client: AsyncClient, seed_school: School, seed_staff: None
) -> None:
    created = await client.post(
        "/guardians", json=_staff_guardian_body(), headers=auth_header(role="Admin")
    )
    assert created.status_code == 201

    found = await client.get(f"/guardians?staffId={STAFF_UUID}", headers=auth_header(role="Admin"))
    assert found.status_code == 200
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["id"] == created.json()["id"]

    empty = await client.get(
        f"/guardians?staffId={OTHER_STAFF_UUID}", headers=auth_header(role="Admin")
    )
    assert empty.status_code == 200
    assert empty.json()["total"] == 0
