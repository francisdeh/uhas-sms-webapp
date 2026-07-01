"""Shared fixtures for the leave-requests test suite."""

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
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.main import app

SCHOOL_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb001")
STAFF_REQUESTER_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb101")
STAFF_APPROVER_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb102")
STAFF_ADMIN_UUID = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb103")
USER_UUID = UUID("00000000-0000-0000-0000-0000000000b1")


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
        slug="test-school-leave",
        name="Test School (leave)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> tuple[Staff, Staff, Staff]:
    requester = Staff(
        id=STAFF_REQUESTER_UUID,
        slug="STAFF-001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Owusu",
        system_role="Teacher",
        division="JHS",
        email="ama@uhas.edu.gh",
        is_active=True,
    )
    approver = Staff(
        id=STAFF_APPROVER_UUID,
        slug="STAFF-002",
        school_id=SCHOOL_UUID,
        first_name="Kwaku",
        last_name="Deputy",
        system_role="DeputyHead",
        division="JHS",
        email="deputy@uhas.edu.gh",
        is_active=True,
    )
    admin = Staff(
        id=STAFF_ADMIN_UUID,
        slug="STAFF-003",
        school_id=SCHOOL_UUID,
        first_name="Nana",
        last_name="Admin",
        system_role="Admin",
        email="admin@uhas.edu.gh",
        is_active=True,
    )
    db_session.add_all([requester, approver, admin])
    await db_session.flush()
    return requester, approver, admin


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
    linked_id: UUID | str | None = STAFF_REQUESTER_UUID,
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
