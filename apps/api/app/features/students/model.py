"""SQLAlchemy models for Students.

Owns Student + StudentGuardian (guardian linkage). Class + Enrollment
were previously stubbed here for the current-year join; they now live
in their own features and are imported when this feature needs to join
against them.
"""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Student(Base):
    __tablename__ = "students"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    middle_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    nationality: Mapped[str | None] = mapped_column(String(100), nullable=True)
    religion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=True)
    # Medical info (Phase 6 item 1) — deliberately unstructured beyond
    # blood_type: a nurse/teacher reads medical_notes, doesn't query it.
    blood_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    medical_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (UniqueConstraint("school_id", "slug", name="students_school_slug_unique"),)


class StudentGuardian(Base):
    __tablename__ = "student_guardians"

    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    guardian_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("guardians.id"), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_primary: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)

    __table_args__ = (PrimaryKeyConstraint("student_id", "guardian_id"),)


class StudentDocument(Base):
    """One uploaded document (birth certificate, Ghana Card, etc.) for a
    student. A child table rather than a JSONB path array — each file
    needs its own label and an accountable uploader (front-office
    function), which a bare array can't carry."""

    __tablename__ = "student_documents"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    # Only set when label="Other" — the free-text description.
    other_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
