"""SchoolTermsRepository — SQL access for the `school_terms` table.

Two access paths matter:
  - List all terms for a school (Calendar tab populates from this on load).
  - Upsert by natural key (school_id, academic_year, term) — the Calendar
    tab posts the full set every save.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.school_terms.model import SchoolTerm


class SchoolTermsRepository:
    @staticmethod
    async def list_for_school(session: AsyncSession, school_id: UUID | str) -> list[SchoolTerm]:
        """Return every term row for a school, sorted (year asc, term asc)."""
        result = await session.execute(
            select(SchoolTerm)
            .where(SchoolTerm.school_id == school_id)
            .order_by(SchoolTerm.academic_year.asc(), SchoolTerm.term.asc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def find_one(
        session: AsyncSession,
        school_id: UUID | str,
        academic_year: str,
        term: int,
    ) -> SchoolTerm | None:
        """Lookup by natural key. Used by upsert to branch insert vs update."""
        result = await session.execute(
            select(SchoolTerm).where(
                SchoolTerm.school_id == school_id,
                SchoolTerm.academic_year == academic_year,
                SchoolTerm.term == term,
            )
        )
        return result.scalar_one_or_none()
