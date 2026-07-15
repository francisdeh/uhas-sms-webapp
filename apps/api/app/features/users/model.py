"""SQLAlchemy model for the app-level `users` table.

The `id` matches the Supabase auth user UUID; the `linked_id` points at
the staff/guardian row that owns the person's business identity. `role`
is the app role (Admin/DeputyHead/Teacher/Parent/Accountant) — separate
from `staff.system_role` because a Parent has no staff row and a Teacher
with `is_unit_head=True` doesn't get a different role.

This table is the audience-resolution anchor for notifications: they
write to `user_id`, and the resolver joins staff/guardian FKs → this
table so a business-identity change (division moved) is reflected
without re-issuing IDs.

Table was created in the Drizzle baseline; columns have been added
since via hand-written Alembic migrations (see `last_password_reset_sent_at`
below).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    # Nullable: a phone-only guardian login (SMS-OTP) has no email.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    linked_id: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    must_change_password: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    # Abuse guard on the public `POST /auth/reset-password` endpoint —
    # a request within the cooldown window is silently skipped.
    last_password_reset_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class UserPreferences(Base):
    """One row per user, created lazily on first write — see
    `MeService.update`. Absent row means every preference is at its
    code-level default (checked at read time), not that the user has
    opted out of anything; there's no backfill migration for existing
    users when a new flag is added here.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)
    email_on_lesson_plan_rejected: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    email_on_results_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Teacher-facing — covers both a new appointment request and a
    # guardian cancelling one (both mean "your calendar changed").
    email_on_appointment_activity: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    sms_on_appointment_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Parent-facing — covers the teacher confirming or declining.
    email_on_appointment_decided: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    sms_on_appointment_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Approver-facing (Admin/DeputyHead) — a staff member submitted a
    # leave request.
    email_on_leave_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_leave_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Requester-facing — their own leave request was approved/rejected.
    email_on_leave_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_leave_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Parent-facing — their child was newly marked absent.
    email_on_attendance_absent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_attendance_absent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Parent-facing — a new assignment was published for their child's class.
    email_on_assignment_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_assignment_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Unit-Head-facing — a scheme was submitted, or the teacher commented.
    email_on_scheme_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_scheme_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Teacher-facing — their own scheme was acknowledged, or a reviewer commented.
    email_on_scheme_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_scheme_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # All-teachers broadcast — the promotion season opened.
    email_on_promotion_season: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_promotion_season: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Reviewer-facing (Admin/DeputyHead) — a class's promotion list was submitted.
    email_on_promotion_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_promotion_activity: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Teacher-facing — their own list was sent back, approved, or a reminder to submit.
    email_on_promotion_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sms_on_promotion_decided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
