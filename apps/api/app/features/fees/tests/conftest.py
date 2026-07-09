"""Shared fixtures for the Fees test suite.

Fixture graph: school → classes (JHS 1, JHS 2 — two classes so
division/class scope resolution has something to distinguish) → staff
(Accountant, Admin, Teacher) → students → active enrollments. Distinct
`facade…` UUID range keeps this suite composable with the others.
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
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.main import app

SCHOOL_UUID = UUID("facade00-face-4ace-8ace-facade000001")

CLASS_JHS1_UUID = UUID("facade00-face-4ace-8ace-facade000101")
CLASS_JHS2_UUID = UUID("facade00-face-4ace-8ace-facade000102")

ACCOUNTANT_UUID = UUID("facade00-face-4ace-8ace-facade000201")
ADMIN_UUID = UUID("facade00-face-4ace-8ace-facade000202")
TEACHER_UUID = UUID("facade00-face-4ace-8ace-facade000203")

STUDENT1_UUID = UUID("facade00-face-4ace-8ace-facade000301")
STUDENT2_UUID = UUID("facade00-face-4ace-8ace-facade000302")
STUDENT_JHS2_UUID = UUID("facade00-face-4ace-8ace-facade000303")

USER_UUID = UUID("00000000-0000-0000-0000-0000000000fa")

ACADEMIC_YEAR = "2025/2026"


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
        slug="test-school-fees",
        name="Test School (fees)",
        academic_year=ACADEMIC_YEAR,
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_classes(db_session: AsyncSession, seed_school: School) -> dict[str, Class]:
    jhs1 = Class(
        id=CLASS_JHS1_UUID,
        slug="jhs1-fees",
        school_id=SCHOOL_UUID,
        name="JHS 1",
        division="JHS",
        academic_year=ACADEMIC_YEAR,
    )
    jhs2 = Class(
        id=CLASS_JHS2_UUID,
        slug="jhs2-fees",
        school_id=SCHOOL_UUID,
        name="JHS 2",
        division="JHS",
        academic_year=ACADEMIC_YEAR,
    )
    db_session.add_all([jhs1, jhs2])
    await db_session.flush()
    return {"jhs1": jhs1, "jhs2": jhs2}


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> dict[str, Staff]:
    accountant = Staff(
        id=ACCOUNTANT_UUID,
        slug="STAFF-FEE-001",
        school_id=SCHOOL_UUID,
        first_name="Abena",
        last_name="Ledger",
        system_role="Accountant",
        email="abena@uhas.edu.gh",
        is_active=True,
    )
    admin = Staff(
        id=ADMIN_UUID,
        slug="STAFF-FEE-002",
        school_id=SCHOOL_UUID,
        first_name="Kwesi",
        last_name="Admin",
        system_role="Admin",
        email="kwesi@uhas.edu.gh",
        is_active=True,
    )
    teacher = Staff(
        id=TEACHER_UUID,
        slug="STAFF-FEE-003",
        school_id=SCHOOL_UUID,
        first_name="Adjoa",
        last_name="Teach",
        system_role="Teacher",
        division="JHS",
        email="adjoa@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    db_session.add_all([accountant, admin, teacher])
    await db_session.flush()
    return {"accountant": accountant, "admin": admin, "teacher": teacher}


@pytest_asyncio.fixture
async def seed_students(
    db_session: AsyncSession, seed_classes: dict[str, Class]
) -> dict[str, Student]:
    student1 = Student(
        id=STUDENT1_UUID,
        slug="STUDENT-FEE-001",
        school_id=SCHOOL_UUID,
        first_name="Kofi",
        last_name="Mensah",
        is_active=True,
    )
    student2 = Student(
        id=STUDENT2_UUID,
        slug="STUDENT-FEE-002",
        school_id=SCHOOL_UUID,
        first_name="Akosua",
        last_name="Boateng",
        is_active=True,
    )
    student_jhs2 = Student(
        id=STUDENT_JHS2_UUID,
        slug="STUDENT-FEE-003",
        school_id=SCHOOL_UUID,
        first_name="Yaw",
        last_name="Asante",
        is_active=True,
    )
    db_session.add_all([student1, student2, student_jhs2])
    await db_session.flush()

    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT1_UUID,
                class_id=CLASS_JHS1_UUID,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT2_UUID,
                class_id=CLASS_JHS1_UUID,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_JHS2_UUID,
                class_id=CLASS_JHS2_UUID,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()
    return {"student1": student1, "student2": student2, "student_jhs2": student_jhs2}


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
    role: str = "Accountant",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
    linked_id: UUID | str | None = ACCOUNTANT_UUID,
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
