"""HTTP-level tests for `GET /guardians/{id}/children`."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.guardians.tests.conftest import (
    CLASS_UUID,
    GUARDIAN_A_UUID,
    GUARDIAN_B_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.students.model import Student, StudentGuardian


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


async def test_child_promoted_but_not_yet_activated_shows_next_year_class(
    client: AsyncClient, db_session: AsyncSession, seed_school: School, seed_children: None
) -> None:
    """A student can be promoted (Promotions' `approve()` creates a real
    Active enrollment for next year) before the school actually
    activates that year — `list_for_guardian` must still surface that
    upcoming class rather than showing nothing, labelled with the year
    so it's clearly not the current one."""
    next_year_class = UUID("44444444-4444-4444-8444-444444444602")
    guardian_c = UUID("44444444-4444-4444-8444-444444444703")
    student_c = UUID("44444444-4444-4444-8444-444444444803")

    db_session.add(
        Class(
            id=next_year_class,
            slug="class-guardians-jhs2-next",
            school_id=SCHOOL_UUID,
            name="JHS 2",
            division="JHS",
            academic_year="2026/2027",
        )
    )
    db_session.add_all(
        [
            Guardian(
                id=guardian_c,
                slug="GRD-C",
                school_id=SCHOOL_UUID,
                first_name="Yaw",
                last_name="ParentC",
                email="yaw.children@example.com",
            ),
            Student(
                id=student_c,
                slug="STU-C",
                school_id=SCHOOL_UUID,
                first_name="Efo",
                last_name="ChildC",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            StudentGuardian(
                student_id=student_c,
                guardian_id=guardian_c,
                relation="father",
                is_primary=True,
            ),
            # Old enrollment for the school's current year (2025/2026) is
            # Completed, not Active — mirrors the real post-promotion
            # state, where the current-year row stops being "active".
            Enrollment(
                student_id=student_c,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Completed",
                enrollment_date=date(2024, 9, 1),
            ),
            Enrollment(
                student_id=student_c,
                class_id=next_year_class,
                academic_year="2026/2027",
                status="Active",
                enrollment_date=date(2026, 9, 1),
            ),
        ]
    )
    await db_session.flush()

    res = await client.get(f"/guardians/{guardian_c}/children", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(student_c)
    assert items[0]["classId"] == str(next_year_class)
    assert items[0]["className"] == "JHS 2 (2026/2027)"
    assert items[0]["division"] == "JHS"
