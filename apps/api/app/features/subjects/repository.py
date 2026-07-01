"""Data-access layer for Subjects — offset pagination."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.subjects.model import Subject


class SubjectsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        division: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Subject], int]:
        where = [Subject.school_id == school_id]
        if division:
            where.append(Subject.division == division)
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Subject.name).like(func.lower(like)),
                    func.lower(Subject.slug).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)
        total = int(
            (await session.execute(select(func.count(Subject.id)).where(where_clause))).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        rows_stmt = (
            select(Subject)
            .where(where_clause)
            .order_by(asc(Subject.division), asc(Subject.name), asc(Subject.id))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, subject_id: UUID | str
    ) -> Subject | None:
        stmt = select(Subject).where(and_(Subject.id == subject_id, Subject.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_slug(
        session: AsyncSession, school_id: UUID | str, slug: str
    ) -> Subject | None:
        """Slug dedup lookup — subjects define their own slug on create
        (unlike Staff/Guardians which auto-generate)."""
        stmt = select(Subject).where(and_(Subject.school_id == school_id, Subject.slug == slug))
        return (await session.execute(stmt)).scalar_one_or_none()
