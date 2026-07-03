"""Data-access for calendar events. Chronological reads only."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, asc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.calendar.model import CalendarEvent


class CalendarRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        page: int = 1,
        size: int = 200,
    ) -> tuple[list[CalendarEvent], int]:
        """Newest-last order — the FE renders a chronological timeline
        so ascending is right. Default page size is generous (200) because
        even a busy school posts ~40 events a year."""
        where = CalendarEvent.school_id == school_id
        total = int(
            (await session.execute(select(func.count(CalendarEvent.id)).where(where))).scalar_one()
            or 0
        )
        offset = (page - 1) * size
        stmt = (
            select(CalendarEvent)
            .where(where)
            .order_by(asc(CalendarEvent.start_date))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(stmt)).scalars())
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, event_id: UUID | str
    ) -> CalendarEvent | None:
        stmt = select(CalendarEvent).where(
            and_(
                CalendarEvent.id == event_id,
                CalendarEvent.school_id == school_id,
            )
        )
        return (await session.execute(stmt)).scalar_one_or_none()
