"""Shared fixtures for the Schemes test suite.

Same shape as lesson plans — same joined-entity set — with a distinct
UUID range (`ee…`) so both suites can run together without collision.
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
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0001")
CLASS_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0101")
SUBJECT_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0201")
TEACHER_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0301")
UNIT_HEAD_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0302")
DEPUTY_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0303")
DEPUTY_OTHER_UUID = UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0304")
USER_UUID = UUID("00000000-0000-0000-0000-0000000000ee")


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
        slug="test-school-sch",
        name="Test School (schemes)",
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
async def seed_staff(
    db_session: AsyncSession, seed_school: School
) -> tuple[Staff, Staff, Staff, Staff]:
    teacher = Staff(
        id=TEACHER_UUID,
        slug="STAFF-001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Owusu",
        system_role="Teacher",
        division="JHS",
        email="ama@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    unit_head = Staff(
        id=UNIT_HEAD_UUID,
        slug="STAFF-002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Head",
        system_role="Teacher",
        division="JHS",
        is_unit_head=True,
        unit_head_of="JHS",
        email="kojo@uhas.edu.gh",
        rank="Senior Teacher",
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
        email="yaa@uhas.edu.gh",
        is_active=True,
    )
    deputy_other = Staff(
        id=DEPUTY_OTHER_UUID,
        slug="STAFF-004",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Other",
        system_role="DeputyHead",
        division="KG",
        email="efua@uhas.edu.gh",
        is_active=True,
    )
    db_session.add_all([teacher, unit_head, deputy, deputy_other])
    await db_session.flush()
    return teacher, unit_head, deputy, deputy_other


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
