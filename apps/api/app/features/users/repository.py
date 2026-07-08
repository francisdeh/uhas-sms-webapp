"""Data access for the users bridge table.

The list query LEFT JOINs both `staff` and `guardians` because a user
row points at one or the other via `linked_id` (Parents → guardians,
everyone else → staff). Coalescing the name + slug columns app-side
matches the legacy Drizzle implementation.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import and_, asc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.users.model import User

JoinedRow = tuple[User, str | None, str | None, str | None, str | None, str | None, str | None]


class UsersRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 20,
    ) -> tuple[list[JoinedRow], int]:
        """Return (rows, total) — each row carries the user + joined names.

        `q` matches case-insensitively across email + linked
        first_name/last_name on both staff and guardian sides.
        """
        base = (
            select(
                User,
                Staff.first_name,
                Staff.last_name,
                Guardian.first_name,
                Guardian.last_name,
                Staff.slug,
                Guardian.slug,
            )
            .outerjoin(Staff, Staff.id == User.linked_id)
            .outerjoin(Guardian, Guardian.id == User.linked_id)
            .where(User.school_id == school_id)
        )

        if q:
            like = f"%{q.lower()}%"
            base = base.where(
                or_(
                    func.lower(User.email).like(like),
                    func.lower(Staff.first_name).like(like),
                    func.lower(Staff.last_name).like(like),
                    func.lower(Guardian.first_name).like(like),
                    func.lower(Guardian.last_name).like(like),
                    func.lower(func.concat(Staff.first_name, " ", Staff.last_name)).like(like),
                    func.lower(func.concat(Guardian.first_name, " ", Guardian.last_name)).like(
                        like
                    ),
                )
            )

        count_stmt = select(func.count()).select_from(base.subquery())
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = base.order_by(asc(User.email), asc(User.id)).offset(offset).limit(size)
        result = (await session.execute(rows_stmt)).all()
        return [(r[0], r[1], r[2], r[3], r[4], r[5], r[6]) for r in result], total

    @staticmethod
    async def get_by_id(session: AsyncSession, school_id: UUID | str, user_id: UUID) -> User | None:
        stmt = select(User).where(and_(User.id == user_id, User.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_joined_by_id(
        session: AsyncSession, school_id: UUID | str, user_id: UUID
    ) -> JoinedRow | None:
        stmt = (
            select(
                User,
                Staff.first_name,
                Staff.last_name,
                Guardian.first_name,
                Guardian.last_name,
                Staff.slug,
                Guardian.slug,
            )
            .outerjoin(Staff, Staff.id == User.linked_id)
            .outerjoin(Guardian, Guardian.id == User.linked_id)
            .where(and_(User.id == user_id, User.school_id == school_id))
        )
        row = (await session.execute(stmt)).first()
        if row is None:
            return None
        return (row[0], row[1], row[2], row[3], row[4], row[5], row[6])

    @staticmethod
    async def insert(session: AsyncSession, row: User) -> User:
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def find_by_linked_id(
        session: AsyncSession, school_id: UUID | str, linked_id: UUID | str
    ) -> User | None:
        """The existing login (if any) for a staff/guardian row — backs the
        one-login-per-person guard."""
        stmt = select(User).where(and_(User.linked_id == linked_id, User.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_staff_in_school(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID
    ) -> Staff | None:
        stmt = select(Staff).where(and_(Staff.id == staff_id, Staff.school_id == school_id))
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def find_guardian_in_school(
        session: AsyncSession, school_id: UUID | str, guardian_id: UUID
    ) -> Guardian | None:
        stmt = select(Guardian).where(
            and_(Guardian.id == guardian_id, Guardian.school_id == school_id)
        )
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def touch(session: AsyncSession, _row: Any) -> None:
        """Flush pending changes so callers can re-read the updated row."""
        await session.flush()
