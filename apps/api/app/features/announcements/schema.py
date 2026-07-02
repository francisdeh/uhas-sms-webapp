"""Pydantic schemas for the Announcements HTTP layer."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class AnnouncementCreate(BaseModel):
    """Create request. `audience` is a raw string in the format the
    audience parser accepts (`all`, `division:<name>`, `class:<uuid>`).
    Role-based validation happens in the service."""

    model_config = _CAMEL_CONFIG

    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)
    audience: str = Field(..., min_length=1, max_length=100)
    is_critical: bool = False


class AnnouncementRead(BaseModel):
    """Read shape includes the author's display name (joined from
    staff) so a list caller doesn't need a second fetch."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    title: str
    body: str
    audience: str
    is_critical: bool
    created_by_id: UUID
    created_by_name: str
    created_at: datetime | None = None


class AnnouncementsListResponse(Paginated[AnnouncementRead]):
    """Paged list."""
