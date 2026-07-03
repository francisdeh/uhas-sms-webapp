"""Fixtures for the Appointments test suite.

Distinct UUID range (`ee…`). Seeds enough of the domain to exercise
every validation gate:

  * one JHS class with an active enrolment
  * a class-teacher who's also a subject-teacher (so we test the dedupe)
  * a second teacher who teaches a *different* class (negative case for
    the teacher-teaches-student check)
  * a guardian linked to the child + an *unlinked* guardian for the
    ownership negative case
  * users for both guardians + both teachers so notifications land
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
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0001")
CLASS_JHS_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0101")
CLASS_OTHER_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0102")

SUBJECT_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0201")

# The class teacher — also teaches Maths.
TEACHER_STAFF = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0301")
# A teacher assigned to CLASS_OTHER only — negative case.
OTHER_TEACHER_STAFF = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0302")
ADMIN_STAFF = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0303")

TEACHER_USER = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0401")
OTHER_TEACHER_USER = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0402")
ADMIN_USER = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0403")
GUARDIAN_USER = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0404")
OTHER_GUARDIAN_USER = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0405")

GUARDIAN_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0501")
OTHER_GUARDIAN_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0502")
STUDENT_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0601")


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
    db_session.add(
        School(
            id=SCHOOL_UUID,
            slug="test-school-appt",
            name="Test School (appointments)",
            academic_year="2025/2026",
            current_term=2,
            grading_scale="GES_STANDARD",
            is_active=True,
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            Class(
                id=CLASS_JHS_UUID,
                slug="jhs1-appt",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_OTHER_UUID,
                slug="jhs2-appt",
                school_id=SCHOOL_UUID,
                name="JHS 2",
                division="JHS",
                academic_year="2025/2026",
            ),
        ]
    )
    await db_session.flush()

    db_session.add(
        Subject(
            id=SUBJECT_UUID,
            slug="MATH-A",
            school_id=SCHOOL_UUID,
            name="Mathematics",
            division="JHS",
            category="Core",
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            Staff(
                id=TEACHER_STAFF,
                slug="STAFF-t-appt",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                email="t@appt.test",
                is_active=True,
            ),
            Staff(
                id=OTHER_TEACHER_STAFF,
                slug="STAFF-t2-appt",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Other",
                system_role="Teacher",
                division="JHS",
                email="t2@appt.test",
                is_active=True,
            ),
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-adm-appt",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="adm@appt.test",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    # Wire the teachers to their classes.
    db_session.add_all(
        [
            # Class teacher AND Maths teacher for JHS 1 — exercises the
            # dedupe path in `teachers_for_student`.
            ClassTeacher(
                class_id=CLASS_JHS_UUID,
                staff_id=TEACHER_STAFF,
                is_primary=True,
            ),
            ClassSubject(
                class_id=CLASS_JHS_UUID,
                subject_id=SUBJECT_UUID,
                teacher_id=TEACHER_STAFF,
            ),
            # OTHER_TEACHER teaches CLASS_OTHER only.
            ClassTeacher(
                class_id=CLASS_OTHER_UUID,
                staff_id=OTHER_TEACHER_STAFF,
                is_primary=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Guardian(
                id=GUARDIAN_UUID,
                slug="GRD-appt",
                school_id=SCHOOL_UUID,
                first_name="Akosua",
                last_name="Parent",
                email="p@appt.test",
            ),
            Guardian(
                id=OTHER_GUARDIAN_UUID,
                slug="GRD-appt-2",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="Other",
                email="p2@appt.test",
            ),
            Student(
                id=STUDENT_UUID,
                slug="STU-appt",
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
                class_id=CLASS_JHS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(
                id=TEACHER_USER,
                school_id=SCHOOL_UUID,
                email="t@appt.test",
                role="Teacher",
                linked_id=TEACHER_STAFF,
                is_active=True,
            ),
            User(
                id=OTHER_TEACHER_USER,
                school_id=SCHOOL_UUID,
                email="t2@appt.test",
                role="Teacher",
                linked_id=OTHER_TEACHER_STAFF,
                is_active=True,
            ),
            User(
                id=ADMIN_USER,
                school_id=SCHOOL_UUID,
                email="adm@appt.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
            ),
            User(
                id=GUARDIAN_USER,
                school_id=SCHOOL_UUID,
                email="p@appt.test",
                role="Parent",
                linked_id=GUARDIAN_UUID,
                is_active=True,
            ),
            User(
                id=OTHER_GUARDIAN_USER,
                school_id=SCHOOL_UUID,
                email="p2@appt.test",
                role="Parent",
                linked_id=OTHER_GUARDIAN_UUID,
                is_active=True,
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
    role: str,
    user_id: UUID,
    linked_id: UUID | None,
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
