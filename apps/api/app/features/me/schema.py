"""Pydantic schema for the /me endpoint.

`MeRead` is the wire shape the Next-side session-user resolver
(`getSessionUser()`) consumes on every dashboard page — it replaces
the Drizzle join across `users`, `staff`, and `guardians` with a
single API round-trip.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from app.core.roles import Role
from app.core.school_structure import Division

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class MeRead(BaseModel):
    """Composite session shape returned by `GET /me`.

    Assembles claims from three sources:
      - JWT (uid, email, role, linked_id, must_change_password from
        `user_metadata`).
      - `users` bridge row (is_active flag, fallback email).
      - Linked `staff` or `guardians` row for `display_name`, `slug`
        (human-readable id, e.g. "STAFF-001"), and Teacher/UnitHead's
        `division`.

    `display_name` falls back to email → phone if the linked row is
    missing (which happens briefly during account provisioning).
    """

    model_config = _CAMEL_CONFIG

    uid: UUID
    email: str
    display_name: str
    role: Role
    linked_id: UUID | None = None
    slug: str | None = None
    phone: str | None = None
    must_change_password: bool = False
    is_active: bool = True
    is_unit_head: bool = False
    unit_head_of: Division | None = None
    email_on_lesson_plan_rejected: bool = True
    email_on_results_published: bool = True
    email_on_appointment_activity: bool = True
    sms_on_appointment_activity: bool = True
    email_on_appointment_decided: bool = True
    sms_on_appointment_decided: bool = True
    email_on_leave_activity: bool = True
    sms_on_leave_activity: bool = True
    email_on_leave_decided: bool = True
    sms_on_leave_decided: bool = True
    email_on_attendance_absent: bool = True
    sms_on_attendance_absent: bool = True


class MeUpdate(BaseModel):
    """Partial self-update for `PATCH /me`.

    `display_name` is written to the caller's own linked `staff` or
    `guardians` row. `email_on_lesson_plan_rejected` is written to
    `user_preferences` (upserted — most users have no row until they
    touch a preference for the first time). Anything else about the
    account (role, linked_id, email) goes through the admin-only
    `PATCH /users/{id}` flow instead.

    `phone` is deliberately NOT here — changing it goes through
    `POST /me/phone/confirm` instead, which only ever mirrors a phone
    Supabase Auth has already OTP-confirmed. Accepting a raw phone
    value on this generic endpoint would let a caller silently point
    their own login at any number, with no proof they control it.
    """

    model_config = _CAMEL_CONFIG

    display_name: str | None = None
    email_on_lesson_plan_rejected: bool | None = None
    email_on_results_published: bool | None = None
    email_on_appointment_activity: bool | None = None
    sms_on_appointment_activity: bool | None = None
    email_on_appointment_decided: bool | None = None
    sms_on_appointment_decided: bool | None = None
    email_on_leave_activity: bool | None = None
    sms_on_leave_activity: bool | None = None
    email_on_leave_decided: bool | None = None
    sms_on_leave_decided: bool | None = None
    email_on_attendance_absent: bool | None = None
    sms_on_attendance_absent: bool | None = None
