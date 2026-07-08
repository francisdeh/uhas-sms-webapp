"""Pydantic schemas for the Schemes domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.schemes.constants import SchemeStatus, SchemeType

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class SchemeCreate(BaseModel):
    """Teacher creates; status starts as `draft`. Teacher ID comes from
    the caller's JWT `linked_id`."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    class_id: UUID
    type: SchemeType
    term: int = Field(..., ge=1, le=3)
    academic_year: str = Field(..., pattern=r"^\d{4}/\d{4}$")
    title: str = Field(..., min_length=1, max_length=255)
    file_url: str | None = Field(None, max_length=500)
    content: str | None = None


class SchemeUpdate(BaseModel):
    """Teacher edits while `draft`. Once submitted, no more edits."""

    model_config = _CAMEL_CONFIG

    title: str | None = Field(None, min_length=1, max_length=255)
    file_url: str | None = Field(None, max_length=500)
    content: str | None = None


class SchemeAcknowledgeRequest(BaseModel):
    """`POST /schemes/{id}/acknowledge` — reviewer confirms."""

    model_config = _CAMEL_CONFIG

    comment: str | None = None


class SchemeCommentRequest(BaseModel):
    """`POST /schemes/{id}/comments` — author or reviewer adds to the thread."""

    model_config = _CAMEL_CONFIG

    body: str = Field(..., min_length=1)


class SchemeCommentRead(BaseModel):
    """One entry in a scheme's comment thread, with author display fields."""

    model_config = _CAMEL_CONFIG

    id: UUID
    author_id: UUID
    author_name: str
    body: str
    created_at: datetime | None = None


class SchemeRead(BaseModel):
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
    type: SchemeType
    term: int
    academic_year: str
    title: str
    file_url: str | None = None
    content: str | None = None
    status: SchemeStatus
    reviewed_by_id: UUID | None = None
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None = None
    submitted_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    comments: list[SchemeCommentRead] = Field(default_factory=list)


class SchemesListResponse(Paginated[SchemeRead]):
    """Paged list."""
