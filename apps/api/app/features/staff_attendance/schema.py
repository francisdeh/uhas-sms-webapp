"""Pydantic schemas for staff attendance."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.staff_attendance.constants import StaffAttendanceStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class StaffAttendanceRecordInput(BaseModel):
    model_config = _CAMEL_CONFIG

    staff_id: UUID
    status: StaffAttendanceStatus
    note: str | None = Field(None, max_length=255)


class StaffAttendanceSessionUpsertRequest(BaseModel):
    """Batch save — creates or updates the session for (division, date)."""

    model_config = _CAMEL_CONFIG

    division: Division
    date: date
    term: int = Field(..., ge=1, le=3)
    records: list[StaffAttendanceRecordInput] = Field(
        ...,
        min_length=1,
        description="One row per staff member in the division.",
    )


class StaffAttendanceRecordRead(BaseModel):
    model_config = _CAMEL_CONFIG

    staff_id: UUID
    staff_first_name: str
    staff_last_name: str
    staff_slug: str
    status: StaffAttendanceStatus
    note: str | None = None


class StaffAttendanceSessionRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    division: Division
    date: date
    term: int
    submitted_by_id: UUID | None = None
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None
    records: list[StaffAttendanceRecordRead]


class StaffAttendanceSessionSummary(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    division: Division
    date: date
    term: int
    present_count: int
    absent_count: int
    late_count: int
    on_leave_count: int
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None


class StaffAttendanceSessionsListResponse(Paginated[StaffAttendanceSessionSummary]):
    """Paged summaries. See `app.core.pagination.Paginated`."""
