"""Pydantic schemas for student attendance.

The batch-save shape is `AttendanceSessionUpsertRequest` — the
frontend renders the roster, marks each student, and posts the whole
set. The API upserts the session + records in one transaction.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.attendance.constants import AttendanceStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class AttendanceRecordInput(BaseModel):
    """One row in the batch payload — the client's picture of a student
    on this date."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    status: AttendanceStatus
    late_reason: str | None = Field(None, max_length=255)
    note: str | None = Field(None, max_length=255)


class AttendanceSessionUpsertRequest(BaseModel):
    """`POST /attendance/sessions` — creates (or updates) a session +
    all records atomically. Idempotent under re-submission with the
    same (classId, date)."""

    model_config = _CAMEL_CONFIG

    class_id: UUID
    date: date
    term: int = Field(..., ge=1, le=3)
    records: list[AttendanceRecordInput] = Field(
        ..., min_length=1, description="One row per enrolled student in the class."
    )


class AttendanceRecordRead(BaseModel):
    """Record shape with the joined student display fields."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    student_first_name: str
    student_last_name: str
    student_slug: str
    status: AttendanceStatus
    late_reason: str | None = None
    note: str | None = None


class AttendanceSessionRead(BaseModel):
    """Session + records — the shape the roster page consumes."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    class_id: UUID
    class_name: str
    date: date
    term: int
    submitted_by_id: UUID | None = None
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None
    records: list[AttendanceRecordRead]


class AttendanceSessionSummary(BaseModel):
    """Cheap list shape without the record fan-out — used by history views."""

    model_config = _CAMEL_CONFIG

    id: UUID
    class_id: UUID
    class_name: str
    date: date
    term: int
    present_count: int
    absent_count: int
    late_count: int
    excused_count: int
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None


class AttendanceSessionsListResponse(Paginated[AttendanceSessionSummary]):
    """Paged summaries. See `app.core.pagination.Paginated`."""
