"""Pydantic schemas for the Subjects domain."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)

Division = Literal["KG", "Lower Primary", "Upper Primary", "JHS"]
SubjectCategory = Literal["Core", "Elective", "Optional"]


class SubjectBase(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str = Field(..., min_length=1, max_length=100)
    division: Division | None = None
    category: SubjectCategory | None = "Core"


class SubjectCreate(SubjectBase):
    """Client-supplied slug is the human-readable code (`MATH`, `ENG`).

    Slug is uppercased server-side so the exposed identifier stays
    canonical regardless of what the caller sent.
    """

    slug: str = Field(..., min_length=1, max_length=50)


class SubjectUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str | None = Field(None, min_length=1, max_length=100)
    division: Division | None = None
    category: SubjectCategory | None = None


class SubjectRead(SubjectBase):
    id: UUID
    slug: str
    school_id: UUID


class SubjectsListResponse(Paginated[SubjectRead]):
    """Paged subject list. See `app.core.pagination.Paginated`."""
