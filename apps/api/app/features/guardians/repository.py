"""Data-access layer for Guardians — offset pagination, returns (rows, total)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian


class GuardiansRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[Guardian], int]:
        where = [Guardian.school_id == school_id]
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Guardian.first_name).like(func.lower(like)),
                    func.lower(Guardian.last_name).like(func.lower(like)),
                    func.lower(Guardian.email).like(func.lower(like)),
                    func.lower(Guardian.phone).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)

        count_stmt = select(func.count(Guardian.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Guardian)
            .where(where_clause)
            .order_by(asc(Guardian.last_name), asc(Guardian.id))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, guardian_id: UUID | str
    ) -> Guardian | None:
        stmt = select(Guardian).where(
            and_(Guardian.id == guardian_id, Guardian.school_id == school_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_email_or_phone(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        email: str | None,
        phone: str | None,
    ) -> Guardian | None:
        """Check whether either contact identifier is already taken — the
        DB enforces unique on email + phone columns globally."""
        clauses = []
        if email:
            clauses.append(Guardian.email == email)
        if phone:
            clauses.append(Guardian.phone == phone)
        if not clauses:
            return None
        stmt = select(Guardian).where(and_(Guardian.school_id == school_id, or_(*clauses)))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def next_slug_number(
        session: AsyncSession, school_id: UUID | str, prefix: str = "GUARDIAN-"
    ) -> int:
        stmt = (
            select(Guardian.slug)
            .where(and_(Guardian.school_id == school_id, Guardian.slug.like(f"{prefix}%")))
            .order_by(desc(Guardian.slug))
            .limit(1)
        )
        last = (await session.execute(stmt)).scalar_one_or_none()
        if not last:
            return 1
        try:
            return int(last[len(prefix) :]) + 1
        except ValueError:
            count_stmt = select(func.count(Guardian.id)).where(Guardian.school_id == school_id)
            return int((await session.execute(count_stmt)).scalar_one() or 0) + 1
