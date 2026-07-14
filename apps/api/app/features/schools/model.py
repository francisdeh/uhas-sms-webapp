"""SQLAlchemy model for the `schools` table.

Schools is the multi-tenant anchor — every other domain has a
`school_id` FK that points here. Typed ORM handle over the
Alembic-managed schema.

Per the convention in
[docs/ENGINEERING-CONVENTIONS.md §3a](../../../../../docs/ENGINEERING-CONVENTIONS.md):
PK is `uuid` (DB-generated via `gen_random_uuid()`), and a separate
`slug` column carries the human-readable identifier (`"uhas-basic"`)
for URLs + audit-log readability. Slug is globally unique on schools;
on every other entity table it's unique-per-school.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.features.exams.constants import DEFAULT_PASS_MARK


class School(Base):
    __tablename__ = "schools"

    # Identity + lifecycle
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    # Globally-unique URL-routable slug, e.g. "uhas-basic".
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    # Fallback only — the resolved "current term" everyone reads comes from
    # `term_resolver.resolve_current_term` (school_terms dates, or
    # `current_term_override` if an Admin pinned one). This column is the
    # last-resort value when neither source can answer, and what
    # `activate_next_year` resets to `1` on rollover.
    current_term: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_term_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grading_scale: Mapped[str | None] = mapped_column(
        String(50), nullable=True, default="GES_STANDARD"
    )
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    # Identity tab
    motto: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    principal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Grading tab — JSONB carries the band/weight arrays + objects.
    grading_bands: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    score_weights: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    pass_mark: Mapped[int | None] = mapped_column(Integer, nullable=True, default=DEFAULT_PASS_MARK)

    # Communication tab
    email_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notification_defaults: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    # Security tab
    password_min_length: Mapped[int | None] = mapped_column(Integer, nullable=True, default=8)
    force_password_change_on_first_login: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True, default=True
    )

    # Branding tab
    default_color_scheme: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="uhas"
    )
    sidebar_accent_hex: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # Leave tab — only Casual leave gets a balance (see leave_requests
    # feature docs); the other types don't work as a fixed annual quota.
    casual_leave_annual_days: Mapped[int] = mapped_column(Integer, nullable=False, default=21)
