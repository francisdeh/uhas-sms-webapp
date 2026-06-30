"""Pydantic schemas for the Students domain.

The Read shape is enriched with the joined current-year enrollment
(className, division, classId) since the table UI shows those fields.
Create takes a `classId` that the service validates + materialises into
an Enrollment row atomically with the Student row.

camelCase wire format via `alias_generator=to_camel`; Python attributes
stay snake_case. `from_attributes=True` lets routers do
`StudentRead.model_validate(orm_row)` directly when the model has all
the read fields.
"""

from __future__ import annotations

from datetime import date, datetime
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

Gender = Literal["Male", "Female"]
Division = Literal["KG", "Lower Primary", "Upper Primary", "JHS"]


class StudentBase(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str = Field(..., min_length=1, max_length=255)
    middle_name: str | None = Field(None, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    photo_url: str | None = Field(None, max_length=500)
    phone: str | None = Field(None, max_length=50)
    address: str | None = None
    nationality: str | None = Field(None, max_length=100)
    religion: str | None = Field(None, max_length=100)


class StudentCreate(StudentBase):
    """Inbound payload for `POST /students`.

    `class_id` triggers the initial Enrollment row. `dob` and `gender`
    are required on create (the report card needs them) even though
    they're optional in `StudentBase` for read-shape flexibility.
    """

    class_id: UUID
    dob: date
    gender: Gender


class StudentUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str | None = Field(None, min_length=1, max_length=255)
    middle_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = None
    nationality: str | None = Field(None, max_length=100)
    religion: str | None = Field(None, max_length=100)
    photo_url: str | None = Field(None, max_length=500)


class StudentRead(StudentBase):
    """Read shape — student row + the joined current-year enrollment.

    `class_id` / `class_name` / `division` come from the enrollments
    table. They're `None` for students who have no active enrollment
    in the current academic year (inactive students, mid-promotion).
    """

    id: UUID
    slug: str
    school_id: UUID
    is_active: bool | None = True
    created_at: datetime | None = None
    class_id: UUID | None = None
    class_name: str | None = None
    division: Division | None = None


class StudentsListResponse(Paginated[StudentRead]):
    """Paged student list. See `app.core.pagination.Paginated`."""
