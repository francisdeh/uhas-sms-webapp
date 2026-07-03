"""Business logic for Calendar events.

Admin only for mutations; any authenticated caller in the school can
read. The single non-trivial rule is `end_date >= start_date`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN
from app.features.calendar.model import CalendarEvent
from app.features.calendar.repository import CalendarRepository
from app.features.calendar.schema import CalendarEventCreate


class CalendarService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        page: int = 1,
        size: int = 200,
    ) -> tuple[list[CalendarEvent], int]:
        return await CalendarRepository.list_for_school(session, school_id, page=page, size=size)

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, event_id: UUID | str
    ) -> CalendarEvent:
        row = await CalendarRepository.get_by_id(session, school_id, event_id)
        if not row:
            raise NotFoundError(f"Calendar event {event_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: CalendarEventCreate,
        *,
        actor_role: str,
        author_staff_id: UUID | str,
    ) -> CalendarEvent:
        if actor_role != ADMIN:
            raise ForbiddenError("Only Admin can manage the academic calendar.")
        if payload.end_date is not None and payload.end_date < payload.start_date:
            raise ValidationError("End date must be on or after start date.")

        row = CalendarEvent(
            school_id=school_id,
            title=payload.title,
            description=payload.description,
            start_date=payload.start_date,
            end_date=payload.end_date,
            type=payload.type,
            created_by_id=author_staff_id,
        )
        session.add(row)
        await session.flush()
        return row

    @staticmethod
    async def delete(
        session: AsyncSession,
        school_id: UUID | str,
        event_id: UUID | str,
        *,
        actor_role: str,
    ) -> None:
        if actor_role != ADMIN:
            raise ForbiddenError("Only Admin can delete calendar events.")
        row = await CalendarService.get(session, school_id, event_id)
        await session.delete(row)
        await session.flush()
