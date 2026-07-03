"""Pydantic schemas for the Calendar HTTP layer."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.calendar.constants import CalendarEventType

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class CalendarEventCreate(BaseModel):
    """Create request. Admin only — see `CalendarService.create` for
    the role gate."""

    model_config = _CAMEL_CONFIG

    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    start_date: date
    end_date: date | None = None
    type: CalendarEventType


class CalendarEventRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    title: str
    description: str | None = None
    start_date: date
    end_date: date | None = None
    type: CalendarEventType
    created_by_id: UUID
    created_at: datetime | None = None


class CalendarEventsListResponse(Paginated[CalendarEventRead]):
    """Chronological list — oldest event first (matches the TS `asc` ordering)."""
