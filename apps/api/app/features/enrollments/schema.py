"""Pydantic schemas for the Enrollments domain."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.enrollments.constants import EnrollmentStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class EnrollmentRead(BaseModel):
    """Read shape — joined class + student fields for display.

    The class name / student name / photo url come from LEFT JOINs in
    the list query so the roster + student-history UIs render without
    a second lookup per row.
    """

    model_config = _CAMEL_CONFIG

    id: UUID
    student_id: UUID
    class_id: UUID
    class_name: str | None = None
    division: str | None = None
    academic_year: str
    status: EnrollmentStatus
    enrollment_date: date
    # Joined student fields — filled when the query traverses students.
    student_slug: str | None = None
    student_first_name: str | None = None
    student_last_name: str | None = None
    student_gender: str | None = None
    student_photo_url: str | None = None
    student_is_active: bool | None = None


class EnrollmentCreate(BaseModel):
    """`POST /enrollments` — enrol an existing student into a class.

    Doesn't take `academicYear`; server reads it from the school's
    current config (single source of truth for what "this year" means).
    """

    model_config = _CAMEL_CONFIG

    student_id: UUID
    class_id: UUID


class EnrollmentStatusUpdate(BaseModel):
    """`PATCH /enrollments/{id}` — narrow endpoint just for status changes.

    Uses `Field(...)` (required) — no partial-update semantics; the
    caller states the target status explicitly. The promotion flow
    drives this; class transfers use `EnrollmentTransferRequest` instead
    so withdraw-old + create-new happen in one transaction.
    """

    model_config = _CAMEL_CONFIG

    status: EnrollmentStatus = Field(...)


class EnrollmentTransferRequest(BaseModel):
    """`POST /enrollments/transfer` — move a student to a different class
    within the current academic year. Closes their current Active
    enrollment (if any) and opens a new one atomically — replaces what
    used to be a two-call client-orchestrated sequence (withdraw, then
    create) that could leave a student with no active enrollment
    anywhere if the second call failed after the first succeeded.
    """

    model_config = _CAMEL_CONFIG

    student_id: UUID
    class_id: UUID


class EnrollmentsListResponse(Paginated[EnrollmentRead]):
    """Paged enrollments list. See `app.core.pagination.Paginated`."""
