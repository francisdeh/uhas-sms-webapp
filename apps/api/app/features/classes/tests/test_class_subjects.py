"""HTTP-level tests for GET /class-subjects (inverse lookups).

Covers the mutually exclusive `subjectId` / `teacherId` query, plus the
role gates: Admin / Deputy Head see anything in-school, Teacher only
their own teacherId, Parent forbidden.
"""

from __future__ import annotations

from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class, ClassSubject
from app.features.classes.tests.conftest import (
    SCHOOL_UUID,
    STAFF_UUID,
    SUBJECT_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject

CLASS_A_UUID = UUID("50505050-5050-4505-8505-000000000001")
CLASS_B_UUID = UUID("50505050-5050-4505-8505-000000000002")
STAFF_UUID_ALT = UUID("50505050-5050-4505-8505-000000000003")


@pytest_asyncio.fixture
async def seed_second_teacher(db_session: AsyncSession, seed_school: School) -> Staff:
    staff = Staff(
        id=STAFF_UUID_ALT,
        slug="STAFF-002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Mensah",
        rank="Teacher",
        system_role="Teacher",
        division="JHS",
        email="kojo@uhas.edu.gh",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_two_classes_with_subject(
    db_session: AsyncSession,
    seed_school: School,
    seed_subject: Subject,
    seed_teacher: Staff,
) -> tuple[Class, Class]:
    """Two classes, both wired to Math with the primary teacher assigned."""
    class_a = Class(
        id=CLASS_A_UUID,
        slug="class-jhs1",
        school_id=SCHOOL_UUID,
        name="JHS 1",
        division="JHS",
        academic_year="2025/2026",
    )
    class_b = Class(
        id=CLASS_B_UUID,
        slug="class-jhs2",
        school_id=SCHOOL_UUID,
        name="JHS 2",
        division="JHS",
        academic_year="2025/2026",
    )
    db_session.add_all([class_a, class_b])
    await db_session.flush()

    db_session.add_all(
        [
            ClassSubject(class_id=CLASS_A_UUID, subject_id=SUBJECT_UUID, teacher_id=STAFF_UUID),
            ClassSubject(class_id=CLASS_B_UUID, subject_id=SUBJECT_UUID, teacher_id=STAFF_UUID),
        ]
    )
    await db_session.flush()
    return class_a, class_b


async def test_missing_auth_returns_401(client: AsyncClient) -> None:
    res = await client.get(f"/class-subjects?subjectId={SUBJECT_UUID}")
    assert res.status_code == 401


async def test_neither_param_returns_400(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/class-subjects", headers=auth_header(role="Admin"))
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_query"


async def test_both_params_returns_400(client: AsyncClient, seed_school: School) -> None:
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}&teacherId={STAFF_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_query"


async def test_parent_forbidden(client: AsyncClient, seed_school: School) -> None:
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}",
        headers=auth_header(role="Parent"),
    )
    assert res.status_code == 403


async def test_admin_can_query_by_subject_id(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["rows"]) == 2
    row = body["rows"][0]
    assert row["subjectId"] == str(SUBJECT_UUID)
    assert row["subjectName"] == "Mathematics"
    assert row["subjectSlug"] == "MATH"
    assert row["className"] in {"JHS 1", "JHS 2"}
    assert row["classSlug"] in {"class-jhs1", "class-jhs2"}
    assert row["division"] == "JHS"
    assert row["teacherId"] == str(STAFF_UUID)
    assert row["teacherName"] == "Ama Ofori"


async def test_deputy_can_query_by_subject_id(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}",
        headers=auth_header(role="DeputyHead"),
    )
    assert res.status_code == 200
    assert len(res.json()["rows"]) == 2


async def test_admin_can_query_by_teacher_id(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    res = await client.get(
        f"/class-subjects?teacherId={STAFF_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    rows = res.json()["rows"]
    assert len(rows) == 2
    assert all(r["teacherId"] == str(STAFF_UUID) for r in rows)


async def test_teacher_can_query_own_teacher_id(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    res = await client.get(
        f"/class-subjects?teacherId={STAFF_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_UUID),
    )
    assert res.status_code == 200
    assert len(res.json()["rows"]) == 2


async def test_teacher_forbidden_for_other_teacher_id(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
    seed_second_teacher: Staff,
) -> None:
    res = await client.get(
        f"/class-subjects?teacherId={STAFF_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_UUID_ALT),
    )
    assert res.status_code == 403


async def test_teacher_forbidden_for_subject_id_lookup(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}",
        headers=auth_header(role="Teacher", linked_id=STAFF_UUID),
    )
    assert res.status_code == 403


async def test_scoped_to_caller_school(
    client: AsyncClient,
    seed_two_classes_with_subject: tuple[Class, Class],
) -> None:
    """A caller from another school gets an empty rowset — never leaks the
    in-school assignments even if they pass a subject_id they somehow knew.
    """
    other_school = UUID("77777777-7777-4777-8777-777777777702")
    res = await client.get(
        f"/class-subjects?subjectId={SUBJECT_UUID}",
        headers=auth_header(role="Admin", school_id=other_school),
    )
    assert res.status_code == 200
    assert res.json()["rows"] == []
