"""Shared fixtures for the Assignments test suite.

Distinct UUID range (`aa…`) so this suite composes with lesson_plans
(`dd…`) and schemes (`ee…`) when the full pytest run seeds them in a
single transaction. Adds a Guardian + StudentGuardian join because the
Parent-facing list endpoint is unique to this domain.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import date
from typing import Any
from uuid import UUID

import jwt
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")
CLASS_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0101")
CLASS_OTHER_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0102")
SUBJECT_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0201")

TEACHER_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0301")
OTHER_TEACHER_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0302")
DEPUTY_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0303")
ADMIN_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0304")

STUDENT_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0401")
STUDENT_OTHER_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0402")
GUARDIAN_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0501")
OTHER_GUARDIAN_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0502")

USER_UUID = UUID("00000000-0000-0000-0000-0000000000aa")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        s = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield s
        finally:
            await s.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def seed_school(db_session: AsyncSession) -> School:
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-asg",
        name="Test School (assignments)",
        academic_year="2025/2026",
        current_term=2,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_classes(db_session: AsyncSession, seed_school: School) -> tuple[Class, Class]:
    """Two classes so we can test class-filtered lists + parent-scoped
    reads."""
    a = Class(
        id=CLASS_UUID,
        slug="class-jhs1",
        school_id=SCHOOL_UUID,
        name="JHS 1",
        division="JHS",
        academic_year="2025/2026",
    )
    b = Class(
        id=CLASS_OTHER_UUID,
        slug="class-jhs2",
        school_id=SCHOOL_UUID,
        name="JHS 2",
        division="JHS",
        academic_year="2025/2026",
    )
    db_session.add_all([a, b])
    await db_session.flush()
    return a, b


@pytest_asyncio.fixture
async def seed_subject(db_session: AsyncSession, seed_school: School) -> Subject:
    subj = Subject(
        id=SUBJECT_UUID,
        slug="MATH",
        school_id=SCHOOL_UUID,
        name="Mathematics",
        division="JHS",
        category="Core",
    )
    db_session.add(subj)
    await db_session.flush()
    return subj


@pytest_asyncio.fixture
async def seed_staff(
    db_session: AsyncSession, seed_school: School
) -> tuple[Staff, Staff, Staff, Staff]:
    """teacher (owner), other_teacher, deputy, admin — the four callers
    we exercise across the auth matrix."""
    teacher = Staff(
        id=TEACHER_UUID,
        slug="STAFF-001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Owusu",
        system_role="Teacher",
        division="JHS",
        email="ama.asg@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    other = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-002",
        school_id=SCHOOL_UUID,
        first_name="Kwesi",
        last_name="Anka",
        system_role="Teacher",
        division="JHS",
        email="kwesi.asg@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    deputy = Staff(
        id=DEPUTY_UUID,
        slug="STAFF-003",
        school_id=SCHOOL_UUID,
        first_name="Yaa",
        last_name="Deputy",
        system_role="DeputyHead",
        division="JHS",
        email="yaa.asg@uhas.edu.gh",
        is_active=True,
    )
    admin = Staff(
        id=ADMIN_UUID,
        slug="STAFF-004",
        school_id=SCHOOL_UUID,
        first_name="Kwame",
        last_name="Admin",
        system_role="Admin",
        email="admin.asg@uhas.edu.gh",
        is_active=True,
    )
    db_session.add_all([teacher, other, deputy, admin])
    await db_session.flush()
    return teacher, other, deputy, admin


@pytest_asyncio.fixture
async def seed_parent_and_children(
    db_session: AsyncSession,
    seed_school: School,
    seed_classes: tuple[Class, Class],
) -> tuple[Guardian, Student, Student]:
    """One guardian, two students; one student in CLASS_UUID and one in
    CLASS_OTHER_UUID. Enrollments are active for the school's academic
    year (`2025/2026`).

    Also seeds a *second* guardian with no children so the ownership
    negative test has a clean caller.
    """
    guardian = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-001",
        school_id=SCHOOL_UUID,
        first_name="Akosua",
        last_name="Parent",
        email="akosua.parent@example.com",
    )
    other_guardian = Guardian(
        id=OTHER_GUARDIAN_UUID,
        slug="GRD-002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Otherparent",
        email="kojo.otherparent@example.com",
    )
    child_a = Student(
        id=STUDENT_UUID,
        slug="UHAS-2025-0001",
        school_id=SCHOOL_UUID,
        first_name="Kofi",
        last_name="Owusu",
        is_active=True,
    )
    child_b = Student(
        id=STUDENT_OTHER_UUID,
        slug="UHAS-2025-0002",
        school_id=SCHOOL_UUID,
        first_name="Adjoa",
        last_name="Owusu",
        is_active=True,
    )
    db_session.add_all([guardian, other_guardian, child_a, child_b])
    await db_session.flush()

    link_a = StudentGuardian(
        student_id=STUDENT_UUID,
        guardian_id=GUARDIAN_UUID,
        relation="mother",
        is_primary=True,
    )
    link_b = StudentGuardian(
        student_id=STUDENT_OTHER_UUID,
        guardian_id=GUARDIAN_UUID,
        relation="mother",
        is_primary=True,
    )

    en_a = Enrollment(
        student_id=STUDENT_UUID,
        class_id=CLASS_UUID,
        academic_year="2025/2026",
        status="Active",
        enrollment_date=date(2025, 9, 1),
    )
    en_b = Enrollment(
        student_id=STUDENT_OTHER_UUID,
        class_id=CLASS_OTHER_UUID,
        academic_year="2025/2026",
        status="Active",
        enrollment_date=date(2025, 9, 1),
    )
    db_session.add_all([link_a, link_b, en_a, en_b])
    await db_session.flush()
    return guardian, child_a, child_b


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def mint_jwt(
    *,
    role: str = "Teacher",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
    linked_id: UUID | str | None = TEACHER_UUID,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role}
    if school_id is not None:
        app_metadata["school_id"] = str(school_id)
    if linked_id is not None:
        app_metadata["linked_id"] = str(linked_id)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + expires_in,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


def auth_header(**kwargs: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_jwt(**kwargs)}"}
