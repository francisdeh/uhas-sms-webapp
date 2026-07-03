"""Pydantic schemas for the Appointments HTTP layer."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.appointments.constants import (
    AppointmentSlot,
    AppointmentStatus,
    Decision,
)

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class AppointmentCreate(BaseModel):
    """Parent-side create. The guardian id comes from the JWT — the
    parent doesn't get to pretend to be another guardian."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    teacher_id: UUID
    preferred_date: date
    preferred_slot: AppointmentSlot
    reason: str | None = None


class AppointmentRespond(BaseModel):
    """Teacher-side response. `response` is optional on confirm but
    required on decline — the service enforces that; here we just
    accept the raw shape."""

    model_config = _CAMEL_CONFIG

    decision: Decision
    response: str | None = None


class TeacherOption(BaseModel):
    """One row in the `available teachers for this student` picker.
    `subjects` is the list of subjects the teacher teaches this student
    (or the sentinel `Class Teacher` when they're the form teacher)."""

    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    subjects: list[str]


class TeacherOptionsResponse(BaseModel):
    """Wrapper — plain array on the wire so it stays consistent with
    the rest of the API's collection responses."""

    model_config = _CAMEL_CONFIG

    items: list[TeacherOption]


class AppointmentRead(BaseModel):
    """Full read — joined display fields for the guardian, student,
    and teacher so a list caller doesn't need three follow-up fetches."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    guardian_id: UUID
    guardian_name: str
    student_id: UUID
    student_name: str
    teacher_id: UUID
    teacher_name: str
    preferred_date: date
    preferred_slot: AppointmentSlot
    reason: str | None = None
    status: AppointmentStatus
    teacher_response: str | None = None
    responded_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AppointmentsListResponse(Paginated[AppointmentRead]):
    """Paged list — pending first, then most-recent."""


class AppointmentIdResponse(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID = Field(..., description="The id of the newly created row.")
