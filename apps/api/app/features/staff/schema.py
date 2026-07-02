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

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.roles import SystemRole, TeacherRank

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)

Division = Literal["KG", "Lower Primary", "Upper Primary", "JHS"]


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
