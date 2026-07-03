"""Shared fixtures for the Guardians test suite."""

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
from app.features.students.model import Student, StudentGuardian
from app.main import app

SCHOOL_UUID = UUID("44444444-4444-4444-8444-444444444401")
OTHER_SCHOOL_UUID = UUID("44444444-4444-4444-8444-444444444402")
USER_UUID = UUID("00000000-0000-0000-0000-000000000041")

CLASS_UUID = UUID("44444444-4444-4444-8444-444444444601")
GUARDIAN_A_UUID = UUID("44444444-4444-4444-8444-444444444701")
GUARDIAN_B_UUID = UUID("44444444-4444-4444-8444-444444444702")
STUDENT_A_UUID = UUID("44444444-4444-4444-8444-444444444801")
STUDENT_B_UUID = UUID("44444444-4444-4444-8444-444444444802")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def seed_school(db_session: AsyncSession) -> School:
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-for-guardians",
        name="Test School (guardians suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_children(db_session: AsyncSession, seed_school: School) -> None:
    """Two guardians, two students — one enrolled child for GUARDIAN_A,
    one unenrolled child for GUARDIAN_B (exercises the outer-join class)."""
    db_session.add(
        Class(
            id=CLASS_UUID,
            slug="class-guardians-jhs1",
            school_id=SCHOOL_UUID,
            name="JHS 1",
            division="JHS",
            academic_year="2025/2026",
        )
    )
    db_session.add_all(
        [
            Guardian(
                id=GUARDIAN_A_UUID,
                slug="GRD-A",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="ParentA",
                email="efua.children@example.com",
            ),
            Guardian(
                id=GUARDIAN_B_UUID,
                slug="GRD-B",
                school_id=SCHOOL_UUID,
                first_name="Kwame",
                last_name="ParentB",
                email="kwame.children@example.com",
            ),
            Student(
                id=STUDENT_A_UUID,
                slug="STU-A",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="ChildA",
                is_active=True,
            ),
            Student(
                id=STUDENT_B_UUID,
                slug="STU-B",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="ChildB",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            StudentGuardian(
                student_id=STUDENT_A_UUID,
                guardian_id=GUARDIAN_A_UUID,
                relation="mother",
                is_primary=True,
            ),
            StudentGuardian(
                student_id=STUDENT_B_UUID,
                guardian_id=GUARDIAN_B_UUID,
                relation="father",
                is_primary=True,
            ),
            Enrollment(
                student_id=STUDENT_A_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
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
