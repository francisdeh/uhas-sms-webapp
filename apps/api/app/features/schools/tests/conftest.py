"""Test fixtures shared across the Schools test suite.

Provides:
  - `db_session`         a per-test AsyncSession bound to a transaction
                         that's rolled back at teardown — no test
                         leaves DB state behind.
  - `seed_school`        inserts a "school-test-001" row in the test
                         transaction, returning the persisted ORM object.
  - `client`             a TestClient bound to the FastAPI app with
                         `get_session` overridden to yield `db_session`.
  - `mint_jwt(...)`      mints an HS256 token against the configured
                         secret — same shape Supabase Auth produces.
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

# The school_id every test uses. Pinned (not random) so cross-scope
# tests can mint JWTs that mismatch it on purpose. UUIDs are hand-rolled
# — these never collide with real fixture data because the seed script
# uses det()-derived UUIDs from different namespace strings.
SCHOOL_UUID = UUID("11111111-1111-4111-8111-111111111101")
OTHER_SCHOOL_UUID = UUID("11111111-1111-4111-8111-111111111102")
STAFF_LINKED_UUID = UUID("11111111-1111-4111-8111-111111111201")
USER_UUID = UUID("00000000-0000-0000-0000-000000000001")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Per-test async session, rolled back at teardown.

    Opens a connection, begins a top-level transaction, binds a session
    to that connection. Anything the test writes (including audit_log
    rows the service writes) lives inside the transaction and disappears
    when it rolls back — adjacent tests see a clean DB.
    """
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
    """Insert a baseline school row inside the test transaction.

    Returns the persisted ORM object. The slug + uuid are pinned so
    cross-scope tests can mint JWTs against a distinct OTHER_SCHOOL_UUID.
    """
    school = School(
        id=SCHOOL_UUID,
        slug="test-school",
        name="Test School",
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
    """httpx.AsyncClient wired to share the same transactional session.

    Why httpx instead of fastapi.testclient.TestClient: TestClient runs
    FastAPI sync via anyio's own event loop, which collides with
    pytest-asyncio's loop on teardown — asyncpg connections end up
    "attached to a different loop" and rollback raises InterfaceError.
    AsyncClient + ASGITransport stays inside the test's loop, so the
    session and its transaction share lifecycle correctly.

    Routers depend on `get_session`; we override it to yield the test's
    session. The override yields without commit/rollback — the outer
    `db_session` fixture owns the transaction lifecycle.
    """

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
    extra_metadata: dict[str, Any] | None = None,
) -> str:
    """Mint an HS256 token shaped like the ones Supabase Auth issues.

    Real Supabase JWTs carry uuids as strings in the JSON claim payload —
    we mirror that. Tests pass either `UUID` or `str` for convenience;
    we stringify on the way out so the JWT is JSON-clean.
    """
    now = int(time.time())
    app_metadata: dict[str, Any] = {
        "role": role,
        "linked_id": str(STAFF_LINKED_UUID),
    }
    if school_id is not None:
        app_metadata["school_id"] = str(school_id)
    if extra_metadata:
        app_metadata.update(extra_metadata)
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
    """Convenience — `headers=auth_header(role="Teacher")` on a request."""
    return {"Authorization": f"Bearer {mint_jwt(**kwargs)}"}
