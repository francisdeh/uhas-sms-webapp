"""Fixtures for the audit-log test suite.

Distinct UUID range (`77…`). Seeds two users — one linked to a staff
row (Admin), one with only an email (no linked staff, exercises the
fallback path).
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
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("77777777-7777-4777-8777-777777770001")
ADMIN_STAFF = UUID("77777777-7777-4777-8777-777777770301")
ADMIN_USER = UUID("77777777-7777-4777-8777-777777770401")
# A user without a linked staff row — the resolver should fall back
# to their email as the display name.
EMAIL_ONLY_USER = UUID("77777777-7777-4777-8777-777777770402")
# A teacher — used to exercise the non-Admin auth-gate rejection.
TEACHER_USER = UUID("77777777-7777-4777-8777-777777770403")
TEACHER_STAFF = UUID("77777777-7777-4777-8777-777777770302")


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
            slug="test-school-audit",
            name="Test School (audit)",
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
                slug="STAFF-adm-au",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@audit.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_STAFF,
                slug="STAFF-t-au",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                email="t@audit.test",
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
                email="admin@audit.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
            ),
            User(
                id=EMAIL_ONLY_USER,
                school_id=SCHOOL_UUID,
                email="unlinked@audit.test",
                role="Admin",
                linked_id=None,
                is_active=True,
            ),
            User(
                id=TEACHER_USER,
                school_id=SCHOOL_UUID,
                email="t@audit.test",
                role="Teacher",
                linked_id=TEACHER_STAFF,
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
