"""Fixtures for the Exams test suite.

Seeds: school, class (JHS 1, AY 2025/2026), subject (Math), three
students actively enrolled in the class. Distinct UUID range (`cc…`)
to avoid collisions with other suites.
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
from app.features.students.model import Student
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0001")
CLASS_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0101")
SUBJECT_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0201")
STUDENT_A_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0301")
STUDENT_B_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0302")
STUDENT_C_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0303")
USER_UUID = UUID("00000000-0000-0000-0000-0000000000cc")


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
        slug="test-school-exams",
        name="Test School (exams)",
        academic_year="2025/2026",
        current_term=2,
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
async def seed_students(
    db_session: AsyncSession, seed_school: School, seed_class: Class
) -> tuple[Student, Student, Student]:
    a = Student(
        id=STUDENT_A_UUID,
        slug="UHAS-2025-0001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Adjei",
        dob=date(2012, 1, 1),
        gender="Female",
        is_active=True,
    )
    b = Student(
        id=STUDENT_B_UUID,
        slug="UHAS-2025-0002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Boateng",
        dob=date(2012, 2, 2),
        gender="Male",
        is_active=True,
    )
    c = Student(
        id=STUDENT_C_UUID,
        slug="UHAS-2025-0003",
        school_id=SCHOOL_UUID,
        first_name="Yaa",
        last_name="Mensah",
        dob=date(2012, 3, 3),
        gender="Female",
        is_active=True,
    )
    db_session.add_all([a, b, c])
    await db_session.flush()
    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT_A_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_B_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_C_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
        ]
    )
    await db_session.flush()
    return a, b, c


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
    role: str = "Admin",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
    linked_id: UUID | str | None = None,
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
