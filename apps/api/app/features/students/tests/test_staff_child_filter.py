"""HTTP tests for `GET /students?staffChild=true`.

Covers: the filter returns only students with a staff-backed guardian,
and stays correct (no duplicate rows, correct total) for a student with
TWO staff-backed guardians — the join that backs this filter can fan
out a row, so `.distinct()` must hold on both rows and count.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.students.tests.conftest import CLASS_UUID, SCHOOL_UUID, auth_header

STUDENT_STAFF_CHILD = UUID("55555555-5555-4555-8555-555555555d01")
STUDENT_TWO_STAFF_GUARDIANS = UUID("55555555-5555-4555-8555-555555555d02")
STUDENT_PLAIN = UUID("55555555-5555-4555-8555-555555555d03")

STAFF_PARENT_A = UUID("55555555-5555-4555-8555-555555555e01")
STAFF_PARENT_B = UUID("55555555-5555-4555-8555-555555555e02")

GUARDIAN_STAFF_A = UUID("55555555-5555-4555-8555-555555555f01")
GUARDIAN_STAFF_B = UUID("55555555-5555-4555-8555-555555555f02")
GUARDIAN_PLAIN = UUID("55555555-5555-4555-8555-555555555f03")


@pytest_asyncio.fixture
async def seed_staff_child_scenario(
    db_session: AsyncSession, seed_school: School, seed_class: Class
) -> None:
    _ = (seed_school, seed_class)
    db_session.add_all(
        [
            Staff(
                id=STAFF_PARENT_A,
                slug="STAFF-SCF-A",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="StaffA",
                system_role="Teacher",
                division="JHS",
                email="ama.scf@example.com",
                is_active=True,
            ),
            Staff(
                id=STAFF_PARENT_B,
                slug="STAFF-SCF-B",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="StaffB",
                system_role="Teacher",
                division="JHS",
                email="kojo.scf@example.com",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()  # Staff rows must exist before guardians FK to them.
    db_session.add_all(
        [
            Guardian(
                id=GUARDIAN_STAFF_A,
                slug="GRD-SCF-A",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="StaffA",
                email="ama.scf.g@example.com",
                staff_id=STAFF_PARENT_A,
            ),
            Guardian(
                id=GUARDIAN_STAFF_B,
                slug="GRD-SCF-B",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="StaffB",
                email="kojo.scf.g@example.com",
                staff_id=STAFF_PARENT_B,
            ),
            Guardian(
                id=GUARDIAN_PLAIN,
                slug="GRD-SCF-PLAIN",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="Plain",
                email="efua.scf@example.com",
            ),
            Student(
                id=STUDENT_STAFF_CHILD,
                slug="STU-SCF-1",
                school_id=SCHOOL_UUID,
                first_name="Kwabena",
                last_name="One",
                is_active=True,
            ),
            Student(
                id=STUDENT_TWO_STAFF_GUARDIANS,
                slug="STU-SCF-2",
                school_id=SCHOOL_UUID,
                first_name="Abena",
                last_name="Two",
                is_active=True,
            ),
            Student(
                id=STUDENT_PLAIN,
                slug="STU-SCF-3",
                school_id=SCHOOL_UUID,
                first_name="Yaw",
                last_name="Three",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            StudentGuardian(
                student_id=STUDENT_STAFF_CHILD, guardian_id=GUARDIAN_STAFF_A, relation="Mother"
            ),
            StudentGuardian(
                student_id=STUDENT_TWO_STAFF_GUARDIANS,
                guardian_id=GUARDIAN_STAFF_A,
                relation="Mother",
            ),
            StudentGuardian(
                student_id=STUDENT_TWO_STAFF_GUARDIANS,
                guardian_id=GUARDIAN_STAFF_B,
                relation="Father",
            ),
            StudentGuardian(
                student_id=STUDENT_PLAIN, guardian_id=GUARDIAN_PLAIN, relation="Mother"
            ),
            Enrollment(
                student_id=STUDENT_STAFF_CHILD,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_TWO_STAFF_GUARDIANS,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_PLAIN,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
        ]
    )
    await db_session.flush()


async def test_staff_child_filter_excludes_plain_guardians(
    client: AsyncClient, seed_staff_child_scenario: None
) -> None:
    res = await client.get("/students?staffChild=true", headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    ids = {item["id"] for item in body["items"]}
    assert ids == {str(STUDENT_STAFF_CHILD), str(STUDENT_TWO_STAFF_GUARDIANS)}


async def test_staff_child_filter_no_duplicate_for_two_staff_guardians(
    client: AsyncClient, seed_staff_child_scenario: None
) -> None:
    """STUDENT_TWO_STAFF_GUARDIANS has two staff-backed guardians — the
    join must not duplicate the row or inflate the total."""
    res = await client.get("/students?staffChild=true", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    matches = [item for item in body["items"] if item["id"] == str(STUDENT_TWO_STAFF_GUARDIANS)]
    assert len(matches) == 1


async def test_staff_child_filter_off_returns_everyone(
    client: AsyncClient, seed_staff_child_scenario: None
) -> None:
    res = await client.get("/students", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    ids = {item["id"] for item in res.json()["items"]}
    assert {str(STUDENT_STAFF_CHILD), str(STUDENT_TWO_STAFF_GUARDIANS), str(STUDENT_PLAIN)} <= ids


async def test_guardian_read_reflects_is_staff(
    client: AsyncClient, seed_staff_child_scenario: None
) -> None:
    res = await client.get(
        f"/students/{STUDENT_STAFF_CHILD}/guardians", headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    body = res.json()
    assert body[0]["isStaff"] is True
