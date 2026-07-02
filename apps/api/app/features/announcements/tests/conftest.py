"""Fixtures for the Announcements test suite.

Distinct UUID range (`cc…`). Uses a slimmer seed than the notifications
suite because the notification fan-out is covered separately — here we
only care about role gates + per-role list filtering.
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
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0001")

CLASS_JHS1_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0101")
CLASS_KG1_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0102")

ADMIN_STAFF = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0301")
DEPUTY_JHS_STAFF = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0302")
DEPUTY_KG_STAFF = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0303")
TEACHER_JHS_STAFF = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0304")

ADMIN_USER = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0401")
DEPUTY_JHS_USER = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0402")
DEPUTY_KG_USER = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0403")
TEACHER_JHS_USER = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0404")
PARENT_USER = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0405")

GUARDIAN_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0501")
STUDENT_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0601")


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
async def seed(db_session: AsyncSession) -> None:
    """One school, two classes (JHS + KG), Admin, DeputyHead JHS,
    DeputyHead KG, Teacher (JHS), Parent of one JHS student."""
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-anc",
        name="Test School (announcements)",
        academic_year="2025/2026",
        current_term=2,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()

    db_session.add_all(
        [
            Class(
                id=CLASS_JHS1_UUID,
                slug="jhs1-anc",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_KG1_UUID,
                slug="kg1-anc",
                school_id=SCHOOL_UUID,
                name="KG 1",
                division="KG",
                academic_year="2025/2026",
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-adm-anc",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@anc.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_JHS_STAFF,
                slug="STAFF-dh-jhs-anc",
                school_id=SCHOOL_UUID,
                first_name="Yaw",
                last_name="DH-JHS",
                system_role="DeputyHead",
                division="JHS",
                email="dh-jhs@anc.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_KG_STAFF,
                slug="STAFF-dh-kg-anc",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="DH-KG",
                system_role="DeputyHead",
                division="KG",
                email="dh-kg@anc.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_JHS_STAFF,
                slug="STAFF-t-anc",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                email="t@anc.test",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(
                id=ADMIN_USER,
                school_id=SCHOOL_UUID,
                email="admin@anc.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
            ),
            User(
                id=DEPUTY_JHS_USER,
                school_id=SCHOOL_UUID,
                email="dh-jhs@anc.test",
                role="DeputyHead",
                linked_id=DEPUTY_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=DEPUTY_KG_USER,
                school_id=SCHOOL_UUID,
                email="dh-kg@anc.test",
                role="DeputyHead",
                linked_id=DEPUTY_KG_STAFF,
                is_active=True,
            ),
            User(
                id=TEACHER_JHS_USER,
                school_id=SCHOOL_UUID,
                email="t@anc.test",
                role="Teacher",
                linked_id=TEACHER_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=PARENT_USER,
                school_id=SCHOOL_UUID,
                email="parent@anc.test",
                role="Parent",
                linked_id=GUARDIAN_UUID,
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Guardian(
                id=GUARDIAN_UUID,
                slug="GRD-anc",
                school_id=SCHOOL_UUID,
                first_name="Akosua",
                last_name="Parent",
                email="parent-g@anc.test",
            ),
            Student(
                id=STUDENT_UUID,
                slug="STUDENT-anc",
                school_id=SCHOOL_UUID,
                first_name="Kofi",
                last_name="Kid",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            StudentGuardian(
                student_id=STUDENT_UUID,
                guardian_id=GUARDIAN_UUID,
                relation="mother",
                is_primary=True,
            ),
            Enrollment(
                student_id=STUDENT_UUID,
                class_id=CLASS_JHS1_UUID,
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


def auth_header(
    *,
    role: str = "Admin",
    user_id: UUID = ADMIN_USER,
    linked_id: UUID | None = ADMIN_STAFF,
) -> dict[str, str]:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role, "school_id": str(SCHOOL_UUID)}
    if linked_id is not None:
        app_metadata["linked_id"] = str(linked_id)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + 3600,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
