"""Fixtures for the reference-seed tests.

Transactional `db_session` (per-test rollback) over the shared local dev
DB, matching the feature-test pattern. Tests use a pinned throwaway
school id in a distinct UUID range so they never collide with seeded or
committed rows.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import engine


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
