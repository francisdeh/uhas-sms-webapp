"""SQLAlchemy engine + session factory.

Two things live here:

  - `engine`        the lazy-initialised async engine. Reads
                    `settings.database_url`. One per process; SQLAlchemy
                    manages its own connection pool internally.

  - `SessionLocal`  the async session factory. Use the `get_session()`
                    FastAPI dependency from `app.core.deps` to get a
                    request-scoped session — never instantiate sessions
                    directly in feature code.

Every domain calls into the DB through its `repository.py`, which
receives a session via dependency injection. This file is the only
place that knows about pool size, dialect, or echo settings.
"""

from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Shared declarative base for every ORM model in the project.

    Feature `model.py` files subclass this. Alembic's `target_metadata`
    points at `Base.metadata` so autogeneration sees every model.
    """


def _build_engine() -> Any:
    """Construct the engine with project-wide defaults.

    Pool sizes tuned for a small school (peak ~60 concurrent users) on
    a single Railway dyno. Revisit when load testing (Migration Plan
    §15) shows pool exhaustion.
    """
    return create_async_engine(
        settings.database_url,
        echo=settings.database_echo,
        # Default pool_size=5 + max_overflow=10 = 15 connections. Plenty
        # at this scale; bump if Locust reveals exhaustion.
        pool_pre_ping=True,  # cheap health check before each checkout
        pool_recycle=1800,  # recycle connections every 30 min to dodge stale ones
    )


engine = _build_engine()

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # access ORM attributes after commit without re-fetching
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency — yields one session per request.

    Commits on success, rolls back on any exception. Repositories
    operate inside this scope; they don't open transactions themselves.
    """
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
