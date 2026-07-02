"""Data-access for the Announcements domain.

Read paths always join the author's staff row so `AnnouncementRead`
has its display name without a follow-up fetch. Role-based visibility
filtering happens in the service — the repository returns the raw list.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.announcements.model import Announcement
from app.features.staff.model import Staff


class AnnouncementsRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Announcement, Staff]], int]:
        """Newest-first list of every announcement in the school. The
        service filters per-role after.

        A future optimisation would push the role filter into SQL
        (`audience IN (...)`), but the volume is low enough that
        Python filtering is fine — a busy school posts ~5 announcements
        a week.
        """
        where = Announcement.school_id == school_id
        count_stmt = select(func.count(Announcement.id)).where(where)
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(Announcement, Staff)
            .join(Staff, Staff.id == Announcement.created_by_id)
            .where(where)
            .order_by(desc(Announcement.created_at))
            .offset(offset)
            .limit(size)
        )
        rows = [(a, s) for a, s in (await session.execute(rows_stmt)).all()]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession,
        school_id: UUID | str,
        announcement_id: UUID | str,
    ) -> tuple[Announcement, Staff] | None:
        stmt = (
            select(Announcement, Staff)
            .join(Staff, Staff.id == Announcement.created_by_id)
            .where(
                and_(
                    Announcement.id == announcement_id,
                    Announcement.school_id == school_id,
                )
            )
        )
        row = (await session.execute(stmt)).first()
        return (row[0], row[1]) if row else None
