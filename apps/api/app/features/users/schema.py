"""Pydantic schemas for the admin user-management API.

Mirrors the legacy TS `ManagedUser` shape in
[apps/web/src/features/auth/actions/manage-users.ts](../../../../web/src/features/auth/actions/manage-users.ts):
the composite view of a Supabase auth user + the local `users` bridge
row + the linked staff/guardian's display_name.

camelCase wire format via `alias_generator=to_camel`; Python attributes
stay snake_case.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.roles import Role

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class UserRead(BaseModel):
    """Outbound row shape for the admin user-management UI."""

    model_config = _CAMEL_CONFIG

    id: UUID
    email: str
    role: Role
    linked_id: UUID | None = None
    display_name: str = ""
    is_active: bool = True
    must_change_password: bool = True


class UserCreate(BaseModel):
    """Inbound payload for `POST /users`.

    `linked_id` is optional so an admin can provision a Supabase auth
    user before the linked staff/guardian record exists — the UI's
    invite flow allows this. When present, the service enforces that
    the target row exists in the caller's school.
    """

    model_config = _CAMEL_CONFIG

    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=255)
    role: Role
    linked_id: UUID | None = None


class UserUpdate(BaseModel):
    """Partial update for `PATCH /users/{id}`.

    Only `email` and `display_name` are mutable via this route — role
    and linked_id changes go through a distinct admin flow so audit
    logs can track them separately.
    """

    model_config = _CAMEL_CONFIG

    email: EmailStr | None = None
    display_name: str | None = Field(None, min_length=1, max_length=255)


class UsersListResponse(Paginated[UserRead]):
    """Paged user list — see `app.core.pagination.Paginated` for the envelope."""
