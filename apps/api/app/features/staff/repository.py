"""Pure data-access layer for the Staff domain.

No business rules here — just typed SQL. The service layer composes
these methods + applies invariants + writes audit rows.

`list_for_school` returns (rows, total) for offset-style pagination —
matches the standard `{ items, total, page, size }` envelope our
DataTable expects. See [docs/ENGINEERING-CONVENTIONS.md] §pagination.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.staff.model import Staff


class StaffRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
        active_only: bool = False,
    ) -> tuple[list[Staff], int]:
        """Return (rows, total) — `total` is the unpaged count.

        `q` does case-insensitive `LIKE %q%` across first/last/email/uhas_id.
        Sort order is `(last_name ASC, id ASC)`; pagination is OFFSET-based,
        offset = (page - 1) * size.
        """
        where = [Staff.school_id == school_id]
        if active_only:
            where.append(Staff.is_active.is_(True))
        if q:
            like = f"%{q}%"
            where.append(
                or_(
                    func.lower(Staff.first_name).like(func.lower(like)),
                    func.lower(Staff.last_name).like(func.lower(like)),
                    func.lower(Staff.email).like(func.lower(like)),
                    func.lower(Staff.uhas_id).like(func.lower(like)),
                )
            )

        where_clause = and_(*where)

        # Total first so the UI can render "Page 3 of N" without a second round trip.
        count_stmt = select(func.count(Staff.id)).where(where_clause)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Staff)
            .where(where_clause)
            .order_by(asc(Staff.last_name), asc(Staff.id))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(rows_stmt)).scalars().all())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str
    ) -> Staff | None:
        """Scoped-by-school fetch — never returns another school's staff."""
        stmt = select(Staff).where(and_(Staff.id == staff_id, Staff.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_by_email(
        session: AsyncSession, school_id: UUID | str, email: str
    ) -> Staff | None:
        """Used during create to dedupe — emails are per-school unique by
        convention (the UI's invite flow assumes this)."""
        stmt = select(Staff).where(and_(Staff.school_id == school_id, Staff.email == email))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def next_slug_number(
        session: AsyncSession, school_id: UUID | str, prefix: str = "STAFF-"
    ) -> int:
        """Compute the next slug sequence — `STAFF-001`, `STAFF-002`, …

        Reads the max numeric tail across the school's staff. Concurrent
        inserts could race; the per-school slug uniqueness constraint
        catches collisions, the service retries.
        """
        stmt = (
            select(Staff.slug)
            .where(and_(Staff.school_id == school_id, Staff.slug.like(f"{prefix}%")))
            .order_by(desc(Staff.slug))
            .limit(1)
        )
        last = (await session.execute(stmt)).scalar_one_or_none()
        if not last:
            return 1
        try:
            return int(last[len(prefix) :]) + 1
        except ValueError:
            # Edge case: slug doesn't end in digits (manually inserted) —
            # fall back to count + 1 so we don't crash.
            count_stmt = select(func.count(Staff.id)).where(Staff.school_id == school_id)
            return int((await session.execute(count_stmt)).scalar_one() or 0) + 1
