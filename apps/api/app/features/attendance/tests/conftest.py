"""Shared fixtures for the Attendance test suite.

Seeds:
  - one school (AY 2025/2026)
  - one class (JHS 1)
  - two students actively enrolled in that class
  - one staff member (the submitter)

Distinct UUID range (`99…`) to avoid collision if a future suite-wide
fixture ever seeds multiple domains together.
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
from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.main import app

SCHOOL_UUID = UUID("99999999-9999-4999-8999-999999999001")
OTHER_SCHOOL_UUID = UUID("99999999-9999-4999-8999-999999999002")
CLASS_UUID = UUID("99999999-9999-4999-8999-999999999101")
STUDENT_A_UUID = UUID("99999999-9999-4999-8999-999999999201")
STUDENT_B_UUID = UUID("99999999-9999-4999-8999-999999999202")
STAFF_UUID = UUID("99999999-9999-4999-8999-999999999301")
USER_UUID = UUID("00000000-0000-0000-0000-000000000091")


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
        slug="test-school-attendance",
        name="Test School (attendance suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_class(db_session: AsyncSession, seed_school: School) -> Class:
    cls = Class(
        id=CLASS_UUID,
        slug="class-jhs1",
        school_id=SCHOOL_UUID,
        name="JHS 1",
        division="JHS",
        academic_year="2025/2026",
    )
    db_session.add(cls)
    await db_session.flush()
    return cls


@pytest_asyncio.fixture
async def seed_students(
    db_session: AsyncSession, seed_school: School, seed_class: Class
) -> tuple[Student, Student]:
    """Two students, both Active in `seed_class` for the school's current year."""
    a = Student(
        id=STUDENT_A_UUID,
        slug="UHAS-2025-0001",
        school_id=SCHOOL_UUID,
        first_name="Akua",
        last_name="Mensah",
        dob=date(2012, 4, 15),
        gender="Female",
        is_active=True,
    )
    b = Student(
        id=STUDENT_B_UUID,
        slug="UHAS-2025-0002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Boateng",
        dob=date(2012, 8, 3),
        gender="Male",
        is_active=True,
    )
    db_session.add_all([a, b])
    await db_session.flush()

    db_session.add_all(
        [
            Enrollment(
                student_id=a.id,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=b.id,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
        ]
    )
    await db_session.flush()
    return a, b


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> Staff:
    staff = Staff(
        id=STAFF_UUID,
        slug="STAFF-001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Owusu",
        rank="Teacher",
        system_role="Teacher",
        division="JHS",
        email="ama@uhas.edu.gh",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture(autouse=True)
async def seed_class_teacher(
    db_session: AsyncSession, seed_class: Class, seed_staff: Staff
) -> None:
    """`STAFF_UUID` (the default "Teacher" caller in `mint_jwt`) class-
    teaches `CLASS_UUID` — `AttendanceService.upsert_session` now
    requires the acting teacher to actually own the class."""
    db_session.add(ClassTeacher(class_id=CLASS_UUID, staff_id=STAFF_UUID, is_primary=True))
    await db_session.flush()


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
    linked_id: UUID | str | None = STAFF_UUID,
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
