"""Fixtures for the /shell/nav-badges test suite.

Distinct UUID range (`20202020-…`) — no other conftest claims it. Seeds:

  * A school with two classes: one JHS, one KG (division negative case).
  * A subject shared across both classes.
  * Staff:
      - ADMIN_STAFF
      - TEACHER_STAFF          (Teacher, is_unit_head=False)
      - UNIT_HEAD_STAFF        (Teacher, is_unit_head=True, unit_head_of=JHS)
      - DEPUTY_STAFF           (DeputyHead, division=JHS)
  * A parent guardian.
  * Lesson plans seeded per-test via helpers on the `seed` fixture —
    the badge counts depend on plan status + division and each test
    wants a different mix, so the seed doesn't hard-code them.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import jwt
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.classes.model import Class
from app.features.guardians.model import Guardian
from app.features.lesson_plans.constants import (
    SUBMITTED,
    UNIT_HEAD_APPROVED,
)
from app.features.lesson_plans.model import LessonPlan
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("20202020-2020-4202-8202-202020200001")

CLASS_JHS_UUID = UUID("20202020-2020-4202-8202-202020200101")
CLASS_KG_UUID = UUID("20202020-2020-4202-8202-202020200102")

SUBJECT_UUID = UUID("20202020-2020-4202-8202-202020200201")

TEACHER_STAFF = UUID("20202020-2020-4202-8202-202020200301")
UNIT_HEAD_STAFF = UUID("20202020-2020-4202-8202-202020200302")
DEPUTY_STAFF = UUID("20202020-2020-4202-8202-202020200303")
ADMIN_STAFF = UUID("20202020-2020-4202-8202-202020200304")

GUARDIAN_UUID = UUID("20202020-2020-4202-8202-202020200401")

TEACHER_USER = UUID("20202020-2020-4202-8202-202020200501")
UNIT_HEAD_USER = UUID("20202020-2020-4202-8202-202020200502")
DEPUTY_USER = UUID("20202020-2020-4202-8202-202020200503")
ADMIN_USER = UUID("20202020-2020-4202-8202-202020200504")
PARENT_USER = UUID("20202020-2020-4202-8202-202020200505")

_LESSON_PLAN_ID_SEED = 0x20202020202042028202202020209000


def _next_lesson_plan_id() -> UUID:
    global _LESSON_PLAN_ID_SEED
    _LESSON_PLAN_ID_SEED += 1
    return UUID(int=_LESSON_PLAN_ID_SEED)


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
            slug="test-school-shell",
            name="Test School (shell)",
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
                slug="class-jhs1-shell",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_KG_UUID,
                slug="class-kg1-shell",
                school_id=SCHOOL_UUID,
                name="KG 1",
                division="KG",
                academic_year="2025/2026",
            ),
            Subject(
                id=SUBJECT_UUID,
                slug="MATH-shell",
                school_id=SCHOOL_UUID,
                name="Mathematics",
                division="JHS",
                category="Core",
            ),
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-adm-shell",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@shell.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_STAFF,
                slug="STAFF-t-shell",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                is_unit_head=False,
                email="t@shell.test",
                is_active=True,
            ),
            Staff(
                id=UNIT_HEAD_STAFF,
                slug="STAFF-uh-shell",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Head",
                system_role="Teacher",
                division="JHS",
                is_unit_head=True,
                unit_head_of="JHS",
                email="uh@shell.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_STAFF,
                slug="STAFF-dp-shell",
                school_id=SCHOOL_UUID,
                first_name="Yaa",
                last_name="Deputy",
                system_role="DeputyHead",
                division="JHS",
                email="dp@shell.test",
                is_active=True,
            ),
            Guardian(
                id=GUARDIAN_UUID,
                slug="GUAR-p-shell",
                school_id=SCHOOL_UUID,
                first_name="Paa",
                last_name="Parent",
                email="p@shell.test",
            ),
        ]
    )
    await db_session.flush()


async def add_lesson_plan(
    db_session: AsyncSession,
    *,
    class_id: UUID,
    status: str,
    week: int = 1,
) -> LessonPlan:
    """Insert a lesson plan with the given status + class. Teacher/subject
    are the seeded defaults — irrelevant for the badge count."""
    plan = LessonPlan(
        id=_next_lesson_plan_id(),
        school_id=SCHOOL_UUID,
        teacher_id=TEACHER_STAFF,
        subject_id=SUBJECT_UUID,
        class_id=class_id,
        term=2,
        week=week,
        status=status,
    )
    db_session.add(plan)
    await db_session.flush()
    return plan


# Re-export the status constants so tests can import them from a single
# place (they need the exact spelling to seed the right rows).
SUBMITTED_STATUS = SUBMITTED
UNIT_HEAD_APPROVED_STATUS = UNIT_HEAD_APPROVED


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
    email: str = "user@shell.test",
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
            "email": email,
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
