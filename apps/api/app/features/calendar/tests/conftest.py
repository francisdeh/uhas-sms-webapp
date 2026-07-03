"""Fixtures for the Calendar test suite.

Distinct UUID range (`dd…`). Tiny seed — the calendar's only external
join is `staff` for `created_by_id`, so one Admin + one Teacher covers
the role-gate tests.
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
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.main import app

SCHOOL_UUID = UUID("dddddddd-dddd-4ddd-8ddd-dddddddd0001")
ADMIN_STAFF = UUID("dddddddd-dddd-4ddd-8ddd-dddddddd0301")
TEACHER_STAFF = UUID("dddddddd-dddd-4ddd-8ddd-dddddddd0302")
USER_UUID = UUID("00000000-0000-0000-0000-0000000000dd")


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
            slug="test-school-cal",
            name="Test School (calendar)",
            academic_year="2025/2026",
            current_term=2,
            grading_scale="GES_STANDARD",
            is_active=True,
        )
    )
    await db_session.flush()
    db_session.add_all(
        [
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-cal-adm",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@cal.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_STAFF,
                slug="STAFF-cal-t",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                email="t@cal.test",
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
    role: str = "Admin",
    linked_id: UUID | None = ADMIN_STAFF,
) -> dict[str, str]:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role, "school_id": str(SCHOOL_UUID)}
    if linked_id is not None:
        app_metadata["linked_id"] = str(linked_id)
    token = jwt.encode(
        {
            "sub": str(USER_UUID),
            "iat": now,
            "exp": now + 3600,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
