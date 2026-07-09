"""SQLAlchemy models for `fees`: the fee catalog, per-learner
assignments, and recorded payments.

`fee_items.scope_ref` is polymorphic by `scope`: null when
`scope="school"`, a `Division` value when `scope="division"`, a
`classes.id` (as text) when `scope="class"`. Kept as a single nullable
column rather than two separate FK columns since only one is ever set.

`learner_fees` is soft-deletable (`deleted_at`) — same tier as scores,
lesson plans, and schemes per CLAUDE.md's high-risk-table convention,
since excluding a learner from a fee should keep history rather than
erase it.

`fee_payments` has no `status` column: recording a payment *is*
confirming it — every payment is Accountant-entered after the fact
(parents do not pay online), so there's no gateway-driven pending
state to track. `receipt_file_urls` is a JSON list of storage paths,
same pattern as `scheme_weekly_entries.resource_file_urls` — the
Accountant uploads whatever receipt they already issued/collected; the
system never generates one.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class FeeItem(Base):
    __tablename__ = "fee_items"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    term: Mapped[int | None] = mapped_column(Integer, nullable=True)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class LearnerFee(Base):
    __tablename__ = "learner_fees"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    fee_item_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("fee_items.id"), nullable=False)
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="outstanding")
    balance_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Stamped by the weekly fee-reminder job (Phase 5 slice 3) when it
    # texts this fee's primary guardian. Null until the first reminder.
    last_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class FeePayment(Base):
    __tablename__ = "fee_payments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    learner_fee_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("learner_fees.id"), nullable=False
    )
    amount_minor: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receipt_file_urls: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    recorded_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
