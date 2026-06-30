"""Shared fixtures for the SchoolTerms test suite.

Reuses the same patterns as the Schools test suite:
  - Transactional `db_session` for per-test rollback isolation.
  - httpx.AsyncClient for HTTP-level tests (avoids the TestClient event-loop
    race we hit during the schools port).
  - Pinned UUIDs for the school + actor user so cross-scope cases can
    mint mismatching JWTs.
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
from app.main import app

SCHOOL_UUID = UUID("22222222-2222-4222-8222-222222222201")
OTHER_SCHOOL_UUID = UUID("22222222-2222-4222-8222-222222222202")
STAFF_LINKED_UUID = UUID("22222222-2222-4222-8222-222222222301")
USER_UUID = UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Per-test async session, rolled back at teardown."""
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
    """Insert the baseline school row — terms FK to schools.id, so this is
    required setup for every test."""
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-for-terms",
        name="Test School (terms suite)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """AsyncClient wired to share the test transaction's session."""

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
    role: str = "Admin",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
    expires_in: int = 3600,
) -> str:
    """Mint an HS256 token shaped like the Supabase output.

    Real Supabase JWTs sign with ES256; tests use HS256 against the
    configured `supabase_jwt_secret` so we don't need a JWKS endpoint
    available in CI.
    """
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role, "linked_id": str(STAFF_LINKED_UUID)}
    if school_id is not None:
        app_metadata["school_id"] = str(school_id)
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
