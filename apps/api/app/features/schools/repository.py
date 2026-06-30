"""SchoolsRepository — the only place feature code touches `schools` SQL.

Services hold the business rules; repositories hold the queries. Keeping
them separate means service tests can mock the repository without
spinning up a database, and integration tests can swap in a real session
without re-wiring the service layer.

Every method takes a session as the first argument — the session
lifecycle is owned by the FastAPI dependency (`get_session`). Repositories
never call `commit()` or `rollback()` themselves.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.schools.model import School


class SchoolsRepository:
    @staticmethod
    async def get_by_id(session: AsyncSession, school_id: UUID | str) -> School | None:
        """Fetch one school by id, or None if it doesn't exist.

        Accepts `school_id` as either a UUID or a uuid-shaped string —
        the JWT delivers it as str (claims are JSON), the test layer
        usually mints UUID objects. SQLAlchemy + asyncpg casts either
        correctly at the parameter-binding layer.
        """
        result = await session.execute(select(School).where(School.id == school_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def apply_patch(session: AsyncSession, school: School, patch: dict[str, Any]) -> School:
        """Apply a field-level patch in-place. Caller computes the diff.

        We mutate the ORM instance rather than running an UPDATE statement
        so SQLAlchemy emits one UPDATE with the changed columns at flush
        time — and the returned row has the new values immediately
        (useful for callers that want to serialise the response).

        The session.flush() means the UPDATE is sent to Postgres now but
        not yet committed; the outer `get_session` dependency commits at
        the end of the request.
        """
        for field, value in patch.items():
            setattr(school, field, value)
        await session.flush()
        return school
