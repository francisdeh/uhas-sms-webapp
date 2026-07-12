"""Pydantic schemas for the Staff domain.

Convention (per [docs/ENGINEERING-CONVENTIONS.md §20]):
  - `StaffBase`    — fields shared by Create / Read
  - `StaffCreate`  — what the client POSTs
  - `StaffUpdate`  — all fields optional, for PATCH
  - `StaffRead`    — what the API returns (includes id, slug, schoolId, createdAt)

camelCase wire format via `alias_generator=to_camel`; Python attributes
remain snake_case. `populate_by_name=True` lets us hand-write Python
defaults that omit the alias.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.roles import SystemRole, TeacherRank
from app.core.school_structure import Division
from app.features.staff.constants import DocumentLabel

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class StaffBase(BaseModel):
    """Common fields between Create and Read."""

    model_config = _CAMEL_CONFIG

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    rank: TeacherRank | None = None
    system_role: SystemRole | None = None
    division: Division | None = None
    is_unit_head: bool | None = False
    unit_head_of: Division | None = None
    uhas_id: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=50)
    email: EmailStr | None = None
    photo_url: str | None = Field(None, max_length=500)
    hire_date: date | None = None


class StaffCreate(StaffBase):
    """Inbound payload for `POST /staff`.

    `system_role` is required on create (different from `StaffBase`
    where it's optional for partial reads); the service enforces that
    non-Admin roles also supply a `division`.
    """

    system_role: SystemRole
    email: EmailStr


class StaffUpdate(BaseModel):
    """Partial update for `PATCH /staff/{id}`.

    Every field optional — only present fields are written.
    """

    model_config = _CAMEL_CONFIG

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    rank: TeacherRank | None = None
    uhas_id: str | None = Field(None, max_length=50)
    phone: str | None = Field(None, max_length=50)
    email: EmailStr | None = None
    photo_url: str | None = Field(None, max_length=500)
    hire_date: date | None = None


class StaffRoleChange(BaseModel):
    """`PATCH /staff/{id}/role` payload.

    Role changes are tracked in audit_log; kept distinct from `StaffUpdate`
    so the audit hook only fires for actual role moves.
    """

    model_config = _CAMEL_CONFIG

    system_role: SystemRole
    division: Division | None = None


class StaffUnitHeadToggle(BaseModel):
    """`PATCH /staff/{id}/unit-head` payload."""

    model_config = _CAMEL_CONFIG

    is_unit_head: bool
    unit_head_of: Division | None = None


class StaffRead(StaffBase):
    """Outbound shape — everything plus the server-managed fields."""

    id: UUID
    slug: str
    school_id: UUID
    is_active: bool | None = True
    created_at: datetime | None = None


class StaffListResponse(Paginated[StaffRead]):
    """Paged staff list. See `app.core.pagination.Paginated` for the envelope."""


class SubjectExpertiseRead(BaseModel):
    """One subject a staff member is qualified to teach."""

    model_config = _CAMEL_CONFIG

    id: UUID
    slug: str
    name: str


class SubjectExpertiseUpdate(BaseModel):
    """`PUT /staff/{id}/subjects` — full-replace, not incremental."""

    model_config = _CAMEL_CONFIG

    subject_ids: list[UUID] = Field(default_factory=list)


class StaffQualificationCreate(BaseModel):
    """`POST /staff/{id}/qualifications` — Admin only."""

    model_config = _CAMEL_CONFIG

    name: str = Field(..., min_length=1, max_length=255)
    institution: str | None = Field(None, max_length=255)
    year_obtained: int | None = Field(None, ge=1950, le=2100)


class StaffQualificationRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    staff_id: UUID
    name: str
    institution: str | None = None
    year_obtained: int | None = None
    created_at: datetime | None = None


class StaffDocumentCreate(BaseModel):
    """`POST /staff/{id}/documents` — Admin only."""

    model_config = _CAMEL_CONFIG

    label: DocumentLabel
    other_label: str | None = Field(None, max_length=255)
    storage_path: str = Field(..., max_length=500)

    @model_validator(mode="after")
    def _other_label_only_when_other(self) -> Self:
        if self.label == "Other" and not self.other_label:
            raise ValueError('otherLabel is required when label is "Other".')
        if self.label != "Other" and self.other_label:
            raise ValueError('otherLabel must be omitted unless label is "Other".')
        return self


class StaffDocumentRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    staff_id: UUID
    label: DocumentLabel
    other_label: str | None = None
    storage_path: str
    uploaded_by_id: UUID
    uploaded_by_name: str
    created_at: datetime | None = None
