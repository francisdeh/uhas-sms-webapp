"""Fixtures for the Users test suite.

Registers the users router on `app.main:app` at import time — the
router isn't wired in `app/main.py` yet (per task; that hook lands
manually later). Idempotent: the wire-up runs once per test process.

Distinct UUID range (`70707070-…`) so seeded rows can't collide with
any other suite's fixtures.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.schools.model import School
from app.features.users.supabase_admin import (
    SupabaseAdminClient,
    get_supabase_admin_client,
)
from app.main import app

SCHOOL_UUID = UUID("70707070-7070-4707-8707-707070700001")
OTHER_SCHOOL_UUID = UUID("70707070-7070-4707-8707-707070700002")
CALLER_USER_UUID = UUID("70707070-7070-4707-8707-707070700101")

STAFF_UUID_A = UUID("70707070-7070-4707-8707-707070700201")
STAFF_UUID_B = UUID("70707070-7070-4707-8707-707070700202")
GUARDIAN_UUID_A = UUID("70707070-7070-4707-8707-707070700301")

USER_UUID_1 = UUID("70707070-7070-4707-8707-707070700401")
USER_UUID_2 = UUID("70707070-7070-4707-8707-707070700402")
USER_UUID_3 = UUID("70707070-7070-4707-8707-707070700403")


class FakeSupabaseAdminClient:
    """Test double — records calls, mints fresh UUIDs on create."""

    def __init__(self) -> None:
        self.create_calls: list[dict[str, Any]] = []
        self.update_calls: list[dict[str, Any]] = []
        self.delete_calls: list[UUID | str] = []
        self.invite_calls: list[dict[str, Any]] = []
        self._preset_ids: list[UUID] = []
        self._preset_index = 0

    def preset_ids(self, *ids: UUID) -> None:
        self._preset_ids = list(ids)
        self._preset_index = 0

    def _next_uid(self) -> UUID:
        if self._preset_index < len(self._preset_ids):
            uid = self._preset_ids[self._preset_index]
            self._preset_index += 1
            return uid
        return uuid4()

    async def create_user(
        self,
        *,
        email: str,
        password: str,
        app_metadata: dict[str, Any],
        user_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        uid = self._next_uid()
        self.create_calls.append(
            {
                "email": email,
                "password": password,
                "app_metadata": app_metadata,
                "user_metadata": user_metadata,
                "returned_id": uid,
            }
        )
        return {"id": str(uid), "email": email}

    async def update_user_by_id(
        self,
        user_id: UUID | str,
        *,
        email: str | None = None,
        ban_duration: str | None = None,
        app_metadata: dict[str, Any] | None = None,
        user_metadata: dict[str, Any] | None = None,
    ) -> None:
        self.update_calls.append(
            {
                "user_id": user_id,
                "email": email,
                "ban_duration": ban_duration,
                "app_metadata": app_metadata,
                "user_metadata": user_metadata,
            }
        )

    async def delete_user(self, user_id: UUID | str) -> None:
        self.delete_calls.append(user_id)

    async def invite_user_by_email(self, *, email: str, redirect_to: str) -> dict[str, Any]:
        uid = self._next_uid()
        self.invite_calls.append(
            {"email": email, "redirect_to": redirect_to, "returned_id": uid}
        )
        return {"id": str(uid), "email": email}


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
        slug="test-school-for-users",
        name="Test School (users suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest.fixture
def fake_supabase() -> FakeSupabaseAdminClient:
    return FakeSupabaseAdminClient()


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession,
    fake_supabase: FakeSupabaseAdminClient,
) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    def _override_supabase() -> SupabaseAdminClient:
        return fake_supabase

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[get_supabase_admin_client] = _override_supabase
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
    user_id: UUID | str = CALLER_USER_UUID,
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
            "email": "admin@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


def auth_header(**kwargs: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_jwt(**kwargs)}"}
