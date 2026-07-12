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
    document_urls: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _end_after_start(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate.")
        return self


class LeaveStatusUpdate(BaseModel):
    """Approve / reject / cancel — also audit-logged for approve/reject
    (see `LEAVE_DECIDED`), on top of the `approved_by_id` chain."""

    model_config = _CAMEL_CONFIG

    status: LeaveStatus
    # Only meaningful when status="rejected"; validated in the service
    # rather than here since it depends on the sibling field.
    rejection_reason: str | None = Field(None, max_length=2000)


class LeaveSubstituteUpdate(BaseModel):
    """`PATCH /leave-requests/{id}/substitute` — Admin or Deputy (own
    division) only. Purely informational — doesn't touch scheduling."""

    model_config = _CAMEL_CONFIG

    substitute_staff_id: UUID | None = None


class LeaveBalanceRead(BaseModel):
    """`GET /leave-requests/balance/{staffId}` — Casual leave only; see
    the feature's design doc for why other types aren't balance-tracked."""

    model_config = _CAMEL_CONFIG

    staff_id: UUID
    entitlement_days: int
    used_days: int
    remaining_days: int


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
    rejection_reason: str | None = None
    substitute_staff_id: UUID | None = None
    substitute_staff_name: str | None = None
    document_urls: list[str] = Field(default_factory=list)
    created_at: datetime | None = None


class LeaveRequestsListResponse(Paginated[LeaveRequestRead]):
    """Paged leave requests. See `app.core.pagination.Paginated`."""
