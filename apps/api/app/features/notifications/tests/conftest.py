"""Shared fixtures for the Notifications + audience-resolver tests.

Distinct UUID range (`bb…`) so this suite composes with the others.
The graph mirrors the real domain — school → classes → subjects → staff
(Admin, DeputyHead JHS, Unit Head, Teacher) → users (linked to those
staff rows) → students → guardians → enrollments — so any audience
shape can be exercised against real joins.
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
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001")

CLASS_JHS1_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0101")
CLASS_KG1_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0102")

SUBJECT_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0201")

# Staff rows
ADMIN_STAFF = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0301")
DEPUTY_JHS_STAFF = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0302")
UNIT_HEAD_STAFF = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0303")
TEACHER_STAFF = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0304")
INACTIVE_STAFF = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0305")

# Users (Supabase auth ids). Kept parallel to staff for ergonomics.
ADMIN_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0401")
DEPUTY_JHS_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0402")
UNIT_HEAD_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0403")
TEACHER_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0404")
INACTIVE_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0405")
PARENT_USER = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0406")

# Guardian + parent-child
GUARDIAN_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0501")
STUDENT_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0601")

USER_UUID = UUID("00000000-0000-0000-0000-0000000000bb")


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
async def seed_full(db_session: AsyncSession) -> dict[str, Any]:
    """One-shot seed. Every test uses the same graph — cheaper than a
    fan of individual fixtures given the domain overlap."""
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-notif",
        name="Test School (notifications)",
        academic_year="2025/2026",
        current_term=2,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()

    classes = [
        Class(
            id=CLASS_JHS1_UUID,
            slug="jhs1-notif",
            school_id=SCHOOL_UUID,
            name="JHS 1",
            division="JHS",
            academic_year="2025/2026",
        ),
        Class(
            id=CLASS_KG1_UUID,
            slug="kg1-notif",
            school_id=SCHOOL_UUID,
            name="KG 1",
            division="KG",
            academic_year="2025/2026",
        ),
    ]
    db_session.add_all(classes)
    await db_session.flush()

    subject = Subject(
        id=SUBJECT_UUID,
        slug="MATH-N",
        school_id=SCHOOL_UUID,
        name="Mathematics",
        division="JHS",
        category="Core",
    )
    db_session.add(subject)
    await db_session.flush()

    staff_rows = [
        Staff(
            id=ADMIN_STAFF,
            slug="STAFF-adm",
            school_id=SCHOOL_UUID,
            first_name="Adae",
            last_name="Admin",
            system_role="Admin",
            email="admin@notif.test",
            is_active=True,
        ),
        Staff(
            id=DEPUTY_JHS_STAFF,
            slug="STAFF-dh-jhs",
            school_id=SCHOOL_UUID,
            first_name="Yaw",
            last_name="DH-JHS",
            system_role="DeputyHead",
            division="JHS",
            email="dh-jhs@notif.test",
            is_active=True,
        ),
        Staff(
            id=UNIT_HEAD_STAFF,
            slug="STAFF-uh",
            school_id=SCHOOL_UUID,
            first_name="Kojo",
            last_name="UnitHead",
            system_role="Teacher",
            division="JHS",
            is_unit_head=True,
            unit_head_of="JHS",
            email="uh@notif.test",
            is_active=True,
        ),
        Staff(
            id=TEACHER_STAFF,
            slug="STAFF-t",
            school_id=SCHOOL_UUID,
            first_name="Ama",
            last_name="Teacher",
            system_role="Teacher",
            division="JHS",
            email="t@notif.test",
            is_active=True,
        ),
        Staff(
            id=INACTIVE_STAFF,
            slug="STAFF-inactive",
            school_id=SCHOOL_UUID,
            first_name="Ex",
            last_name="Employee",
            system_role="Teacher",
            division="JHS",
            email="ex@notif.test",
            is_active=True,
        ),
    ]
    db_session.add_all(staff_rows)
    await db_session.flush()

    users = [
        User(
            id=ADMIN_USER,
            school_id=SCHOOL_UUID,
            email="admin@notif.test",
            role="Admin",
            linked_id=ADMIN_STAFF,
            is_active=True,
        ),
        User(
            id=DEPUTY_JHS_USER,
            school_id=SCHOOL_UUID,
            email="dh-jhs@notif.test",
            role="DeputyHead",
            linked_id=DEPUTY_JHS_STAFF,
            is_active=True,
        ),
        User(
            id=UNIT_HEAD_USER,
            school_id=SCHOOL_UUID,
            email="uh@notif.test",
            role="Teacher",
            linked_id=UNIT_HEAD_STAFF,
            is_active=True,
        ),
        User(
            id=TEACHER_USER,
            school_id=SCHOOL_UUID,
            email="t@notif.test",
            role="Teacher",
            linked_id=TEACHER_STAFF,
            is_active=True,
        ),
        # Inactive user — the resolver must drop these.
        User(
            id=INACTIVE_USER,
            school_id=SCHOOL_UUID,
            email="ex@notif.test",
            role="Teacher",
            linked_id=INACTIVE_STAFF,
            is_active=False,
        ),
        User(
            id=PARENT_USER,
            school_id=SCHOOL_UUID,
            email="parent@notif.test",
            role="Parent",
            linked_id=GUARDIAN_UUID,
            is_active=True,
        ),
    ]
    db_session.add_all(users)
    await db_session.flush()

    guardian = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-N",
        school_id=SCHOOL_UUID,
        first_name="Akosua",
        last_name="Parent",
        email="parent-guardian@notif.test",
    )
    student = Student(
        id=STUDENT_UUID,
        slug="STUDENT-N",
        school_id=SCHOOL_UUID,
        first_name="Kofi",
        last_name="Student",
        is_active=True,
    )
    db_session.add_all([guardian, student])
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

    return {
        "school": school,
        "classes": {"jhs1": classes[0], "kg1": classes[1]},
        "subject": subject,
        "staff": staff_rows,
        "users": users,
        "student": student,
        "guardian": guardian,
    }


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
    linked_id: UUID | str | None = TEACHER_STAFF,
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
