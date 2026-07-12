"""Fixtures for the /me test suite.

Distinct UUID range (`10101010-…`). Seeds four users to cover every
resolution path:

  - `ADMIN_USER`         → linked Admin staff (rich display_name)
  - `TEACHER_USER`       → linked Teacher staff + is_unit_head=True
  - `PARENT_USER`        → linked guardian (Parent role branch)
  - `EMAIL_ONLY_USER`    → no linked row (email fallback branch)
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.users.model import User
from app.features.users.supabase_admin import get_supabase_admin_client
from app.main import app

SCHOOL_UUID = UUID("10101010-1010-4101-8101-101010100001")

ADMIN_STAFF = UUID("10101010-1010-4101-8101-101010100301")
TEACHER_STAFF = UUID("10101010-1010-4101-8101-101010100302")
GUARDIAN_ID = UUID("10101010-1010-4101-8101-101010100303")

ADMIN_USER = UUID("10101010-1010-4101-8101-101010100401")
TEACHER_USER = UUID("10101010-1010-4101-8101-101010100402")
PARENT_USER = UUID("10101010-1010-4101-8101-101010100403")
EMAIL_ONLY_USER = UUID("10101010-1010-4101-8101-101010100404")


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
            slug="test-school-me",
            name="Test School (me)",
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
                slug="STAFF-adm-me",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@me.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_STAFF,
                slug="STAFF-t-me",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                is_unit_head=True,
                unit_head_of="JHS",
                email="t@me.test",
                is_active=True,
            ),
            Guardian(
                id=GUARDIAN_ID,
                slug="GUAR-p-me",
                school_id=SCHOOL_UUID,
                first_name="Paa",
                last_name="Parent",
                email="p@me.test",
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(
                id=ADMIN_USER,
                school_id=SCHOOL_UUID,
                email="admin@me.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
                must_change_password=False,
            ),
            User(
                id=TEACHER_USER,
                school_id=SCHOOL_UUID,
                email="t@me.test",
                role="Teacher",
                linked_id=TEACHER_STAFF,
                is_active=True,
                must_change_password=False,
            ),
            User(
                id=PARENT_USER,
                school_id=SCHOOL_UUID,
                email="p@me.test",
                role="Parent",
                linked_id=GUARDIAN_ID,
                is_active=True,
                must_change_password=False,
            ),
            User(
                id=EMAIL_ONLY_USER,
                school_id=SCHOOL_UUID,
                email="fallback@me.test",
                role="Admin",
                linked_id=None,
                is_active=True,
                must_change_password=True,
            ),
        ]
    )
    await db_session.flush()


class FakeSupabaseAdminClient:
    """Minimal fake — `PATCH /me` only ever calls `update_user_by_id`;
    `POST /me/phone/confirm` and `POST /me/email/confirm` call
    `get_user_by_id`. Tests set `.phone_by_user_id[uid] = "+233…"` /
    `.email_by_user_id[uid] = "..."` before calling confirm to control
    what "Supabase" reports as already-confirmed."""

    def __init__(self) -> None:
        self.update_calls: list[dict[str, Any]] = []
        self.phone_by_user_id: dict[str, str | None] = {}
        self.email_by_user_id: dict[str, str | None] = {}

    async def create_user(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def update_user_by_id(self, user_id: UUID | str, **kwargs: Any) -> None:
        self.update_calls.append({"user_id": user_id, **kwargs})

    async def delete_user(self, user_id: UUID | str) -> None:
        raise NotImplementedError

    async def invite_user_by_email(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]:
        return {
            "id": str(user_id),
            "email": self.email_by_user_id.get(str(user_id)),
            "phone": self.phone_by_user_id.get(str(user_id)),
        }


@pytest.fixture
def fake_supabase() -> FakeSupabaseAdminClient:
    return FakeSupabaseAdminClient()


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession, fake_supabase: FakeSupabaseAdminClient
) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[get_supabase_admin_client] = lambda: fake_supabase
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
    must_change_password: bool = False,
    email: str = "admin@me.test",
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
            "user_metadata": {"must_change_password": must_change_password},
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
