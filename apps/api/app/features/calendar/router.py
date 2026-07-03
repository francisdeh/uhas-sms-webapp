"""HTTP routes for calendar events.

GET    /calendar           → chronological list (any authenticated caller)
POST   /calendar           → create (Admin)
DELETE /calendar/{id}      → delete (Admin)
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.features.calendar.model import CalendarEvent
from app.features.calendar.schema import (
    CalendarEventCreate,
    CalendarEventRead,
    CalendarEventsListResponse,
)
from app.features.calendar.service import CalendarService

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _to_read(row: CalendarEvent) -> CalendarEventRead:
    return CalendarEventRead(
        id=row.id,
        school_id=row.school_id,
        title=row.title,
        description=row.description,
        start_date=row.start_date,
        end_date=row.end_date,
        type=row.type,
        created_by_id=row.created_by_id,
        created_at=row.created_at,
    )


@router.get(
    "",
    response_model=CalendarEventsListResponse,
    response_model_by_alias=True,
)
async def list_calendar(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=500)] = 200,
) -> CalendarEventsListResponse:
    _ = user
    rows, total = await CalendarService.list_for_school(session, school_id, page=page, size=size)
    return CalendarEventsListResponse(
        items=[_to_read(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.post(
    "",
    response_model=CalendarEventRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_calendar_event(
    payload: CalendarEventCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> CalendarEventRead:
    if not user.linked_id:
        raise ForbiddenError("Cannot create a calendar event without a staff identity.")
    row = await CalendarService.create(
        session,
        school_id,
        payload,
        actor_role=user.role or "",
        author_staff_id=user.linked_id,
    )
    return _to_read(row)


@router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_calendar_event(
    event_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    await CalendarService.delete(session, school_id, event_id, actor_role=user.role or "")
