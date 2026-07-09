"""SQLAlchemy models for `schemes`, their comment thread, and Scheme of
Learning's structured weekly entries.

Column set matches the Drizzle baseline; state + reviewer auth in the
service. Soft-delete via `deleted_at`.

`scheme_comments` is a two-way thread: the scheme's author (teacher) and
its reviewers (Head of School / Deputy / Unit-Head) each append rows,
attributed + time-stamped. It replaced the single overwriting
`reviewer_comment` column that lost history and identity.

`scheme_weekly_entries` is Scheme of Learning's structured content —
one row per week, confirmed against a real sample template rather than
the aspirational 17-field spec in the FRD. `type="work"` schemes never
have entries; they keep using `Scheme.content`.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Scheme(Base):
    __tablename__ = "schemes"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    teacher_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    # Who acknowledged (terminal action) + when — distinct from the
    # comment thread in `scheme_comments`.
    reviewed_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class SchemeComment(Base):
    """One comment in a scheme's thread. Append-only — the service never
    mutates an existing row. `author_id` is the teacher author or a
    reviewer (both are staff)."""

    __tablename__ = "scheme_comments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    scheme_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schemes.id"), nullable=False)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # clock_timestamp() (not now()) so comments appended within one
    # transaction still get strictly increasing, orderable timestamps.
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.clock_timestamp(), nullable=True
    )


class SchemeWeeklyEntry(Base):
    """One week's row in a Scheme of Learning's structured template.
    Only `week` is required — a teacher can save a partially-filled
    week and return to it. `resource_file_urls` is a JSON list of
    storage paths (zero or more attached files), not a relational child
    table — there's no per-file metadata to justify one."""

    __tablename__ = "scheme_weekly_entries"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    scheme_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schemes.id"), nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    strand: Mapped[str | None] = mapped_column(Text, nullable=True)
    sub_strand: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_standard: Mapped[str | None] = mapped_column(Text, nullable=True)
    indicators: Mapped[str | None] = mapped_column(Text, nullable=True)
    resources: Mapped[str | None] = mapped_column(Text, nullable=True)
    resource_file_urls: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
