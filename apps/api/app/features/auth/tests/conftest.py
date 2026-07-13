"""Fixtures for the public auth-adjacent endpoint suite.

Distinct UUID range (`aaaaaaaa-…`) so seeded rows can't collide with
any other suite's fixtures. `/auth/reset-password` is IP-keyed (no
JWT) — the `_reset_limiter` autouse fixture clears `slowapi`'s
in-memory bucket between tests so one test's requests don't count
against another's rate-limit budget.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import engine, get_session
from app.core.errors import NotFoundError
from app.core.rate_limit import limiter
from app.features.schools.model import School
from app.features.users.model import User
from app.features.users.supabase_admin import SupabaseAdminClient, get_supabase_admin_client
from app.main import app

SCHOOL_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001")
USER_UUID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0101")


class FakeSupabaseAdminClient:
    """`generate_link` records calls and returns a deterministic link.
    Emails in `unknown_emails` simulate Supabase's own "user not found"
    (the same signal path the real client re-raises `NotFoundError` for)."""

    def __init__(self) -> None:
        self.generate_link_calls: list[dict[str, Any]] = []
        self.unknown_emails: set[str] = set()

    async def create_user(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def update_user_by_id(self, user_id: UUID | str, **kwargs: Any) -> None:
        raise NotImplementedError

    async def delete_user(self, user_id: UUID | str) -> None:
        raise NotImplementedError

    async def invite_user_by_email(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def generate_link(self, **kwargs: Any) -> dict[str, Any]:
        if kwargs.get("email") in self.unknown_emails:
            raise NotFoundError("No account for that email.")
        self.generate_link_calls.append(kwargs)
        return {
            "action_link": f"https://example.com/verify?type={kwargs['type']}",
            "user_id": str(uuid4()),
        }

    async def reset_mfa(self, user_id: UUID | str) -> int:
        raise NotImplementedError

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]:
        raise NotImplementedError


@pytest.fixture(autouse=True)
def _reset_limiter() -> None:
    limiter.reset()


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
        slug="test-school-auth",
        name="Test School (auth suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_user(db_session: AsyncSession, seed_school: School) -> User:
    user = User(
        id=USER_UUID,
        school_id=SCHOOL_UUID,
        email="staff@auth-suite.example.com",
        role="Teacher",
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
def fake_supabase() -> FakeSupabaseAdminClient:
    return FakeSupabaseAdminClient()


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession, fake_supabase: FakeSupabaseAdminClient
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
