"""Pydantic schemas for the Assignments domain."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.assignments.constants import AssignmentStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class AssignmentCreate(BaseModel):
    """Teacher creates; status starts as `draft`. Teacher ID comes from
    the caller's JWT `linked_id`."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    class_id: UUID
    title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    file_url: str | None = Field(None, max_length=500)
    due_date: date


class AssignmentUpdate(BaseModel):
    """Teacher edits. Draft can be freely edited; a published assignment
    can still be edited (mirrors current TS behaviour) — the state
    machine only guards ownership + publish/unpublish transitions."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID | None = None
    class_id: UUID | None = None
    title: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    file_url: str | None = Field(None, max_length=500)
    due_date: date | None = None


class AssignmentRead(BaseModel):
    """Read shape includes joined display fields."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    teacher_id: UUID
    teacher_first_name: str
    teacher_last_name: str
    subject_id: UUID
    subject_slug: str
    subject_name: str
    class_id: UUID
    class_name: str
    division: Division
    title: str
    description: str | None = None
    file_url: str | None = None
    due_date: date
    status: AssignmentStatus
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentsListResponse(Paginated[AssignmentRead]):
    """Paged list."""
