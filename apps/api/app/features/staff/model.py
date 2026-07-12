"""SQLAlchemy model for the `staff` table.

Typed ORM handle over the Alembic-managed schema.

Per [docs/ENGINEERING-CONVENTIONS.md §3a]: PK is `uuid`
(DB-generated via `gen_random_uuid()`), and a separate `slug`
("STAFF-042") carries the human-readable identifier. Slug is unique
per school via the composite constraint declared at table level.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    PrimaryKeyConstraint,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    uhas_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    rank: Mapped[str | None] = mapped_column(String(100), nullable=True)
    system_role: Mapped[str | None] = mapped_column(String(50), nullable=True)
    division: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_unit_head: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    unit_head_of: Mapped[str | None] = mapped_column(String(50), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (UniqueConstraint("school_id", "slug", name="staff_school_slug_unique"),)


class StaffSubjectExpertise(Base):
    """Which subjects a staff member is qualified to teach — distinct
    from `class_subjects.teacher_id`'s current-assignment meaning.
    Full-replace tag-list semantics; no extra columns needed."""

    __tablename__ = "staff_subject_expertise"

    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)

    __table_args__ = (PrimaryKeyConstraint("staff_id", "subject_id"),)


class StaffQualification(Base):
    """One structured qualification entry (degree/certification) for a
    staff member — a child table, not free text, so the UI can list
    individual credentials."""

    __tablename__ = "staff_qualifications"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    year_obtained: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class StaffDocument(Base):
    """One uploaded document (certificate, contract, etc.) for a staff
    member — same shape as `students.StudentDocument`. Gated more
    tightly than the rest of this feature's open-read precedent:
    certificates/contracts aren't something every logged-in user
    should be able to pull up for a colleague."""

    __tablename__ = "staff_documents"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    other_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
