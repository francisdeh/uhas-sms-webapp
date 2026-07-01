"""Pydantic schemas for leave requests."""

from __future__ import annotations

from datetime import date, datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.leave_requests.constants import LeaveStatus, LeaveType

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class LeaveRequestCreate(BaseModel):
    """Payload from the staff dashboard's `Request Leave` form.

    `staffId` is optional: when the caller is a staff member requesting
    for themselves the router fills it from `linked_id`. Admins can
    file on behalf of staff by passing an explicit `staffId`.
    """

    model_config = _CAMEL_CONFIG

    type: LeaveType
    start_date: date
    end_date: date
    reason: str | None = Field(None, max_length=2000)
    staff_id: UUID | None = None

    @model_validator(mode="after")
    def _end_after_start(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate.")
        return self


class LeaveStatusUpdate(BaseModel):
    """Approve / reject / cancel — audit chain is via `approved_by_id`."""

    model_config = _CAMEL_CONFIG

    status: LeaveStatus


class LeaveRequestRead(BaseModel):
    """Read shape includes staff + approver display names for the UI."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    staff_id: UUID
    staff_first_name: str
    staff_last_name: str
    type: LeaveType
    start_date: date
    end_date: date
    reason: str | None = None
    status: LeaveStatus
    approved_by_id: UUID | None = None
    approved_by_name: str | None = None
    created_at: datetime | None = None


class LeaveRequestsListResponse(Paginated[LeaveRequestRead]):
    """Paged leave requests. See `app.core.pagination.Paginated`."""
