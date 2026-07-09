"""Pydantic schemas for the Guardians domain.

Same Base/Create/Update/Read convention as Staff. The dual-identifier
invariant ("email OR phone required") is enforced via a `model_validator`
so it shows up in 422 responses with a helpful message — rather than
relying on the DB CHECK constraint which would just throw 500.
"""

from __future__ import annotations

from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class GuardianBase(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str = Field(..., min_length=1, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)


class GuardianCreate(GuardianBase):
    """`staff_id` tags this guardian record as staff-backed — the staff
    member is also this student's guardian. `GuardiansService.create`
    reuses any existing guardian for that staff member rather than
    creating a duplicate."""

    staff_id: UUID | None = None

    @model_validator(mode="after")
    def _email_or_phone_required(self) -> Self:
        if not self.email and not self.phone:
            raise ValueError("At least one of email or phone is required.")
        return self


class GuardianUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str | None = Field(None, min_length=1, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(None, max_length=50)


class GuardianRead(GuardianBase):
    id: UUID
    slug: str
    school_id: UUID
    staff_id: UUID | None = None


class GuardiansListResponse(Paginated[GuardianRead]):
    """Paged guardian list. See `app.core.pagination.Paginated`."""
