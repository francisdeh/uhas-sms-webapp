"""Tests for `GET /students/{id}/guardian`."""

from __future__ import annotations

from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.students.model import Student, StudentGuardian
from app.features.students.tests.conftest import SCHOOL_UUID, auth_header

STUDENT_WITH_GUARDIAN_UUID = UUID("55555555-5555-4555-8555-555555555801")
STUDENT_WITHOUT_GUARDIAN_UUID = UUID("55555555-5555-4555-8555-555555555802")
GUARDIAN_UUID = UUID("55555555-5555-4555-8555-555555555901")


@pytest_asyncio.fixture
async def seed_guardian_link(db_session: AsyncSession, seed_school: School) -> None:
    db_session.add_all(
        [
            Student(
                id=STUDENT_WITH_GUARDIAN_UUID,
                slug="STU-GRD-1",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Linked",
                is_active=True,
            ),
            Student(
                id=STUDENT_WITHOUT_GUARDIAN_UUID,
                slug="STU-GRD-2",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Unlinked",
                is_active=True,
            ),
            Guardian(
                id=GUARDIAN_UUID,
                slug="GRD-STU-1",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="Parent",
                email="efua.studentguardian@example.com",
            ),
        ]
    )
    await db_session.flush()
    db_session.add(
        StudentGuardian(
            student_id=STUDENT_WITH_GUARDIAN_UUID,
            guardian_id=GUARDIAN_UUID,
            relation="mother",
            is_primary=True,
        )
    )
    await db_session.flush()


async def test_returns_linked_guardian(client: AsyncClient, seed_guardian_link: None) -> None:
    res = await client.get(
        f"/students/{STUDENT_WITH_GUARDIAN_UUID}/guardian", headers=auth_header()
    )
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == str(GUARDIAN_UUID)
    assert body["slug"] == "GRD-STU-1"
    assert body["name"] == "Efua Parent"
    assert body["relationship"] == "mother"


async def test_returns_null_when_no_guardian_linked(
    client: AsyncClient, seed_guardian_link: None
) -> None:
    res = await client.get(
        f"/students/{STUDENT_WITHOUT_GUARDIAN_UUID}/guardian", headers=auth_header()
    )
    assert res.status_code == 200
    assert res.json() is None


async def test_requires_auth(client: AsyncClient, seed_guardian_link: None) -> None:
    res = await client.get(f"/students/{STUDENT_WITH_GUARDIAN_UUID}/guardian")
    assert res.status_code == 401
