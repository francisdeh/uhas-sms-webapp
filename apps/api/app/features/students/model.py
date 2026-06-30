"""SQLAlchemy models for Students + the structural tables we read against.

`Class` and `Enrollment` aren't owned by this feature yet — they belong
to the Academic Structure domain (Phase 2 PR #3). We define them here as
slim read-only ORM handles so we can:

  - validate `classId` on student creation
  - join enrollment for `currentClassName` / `division` in the list response

When Phase 2 PR #3 ports Classes, it should move these definitions into
its own `app/features/classes/model.py` and we'll re-export from there.
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
from app.features.students.constants import ACTIVE


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
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (UniqueConstraint("school_id", "slug", name="students_school_slug_unique"),)


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    division: Mapped[str] = mapped_column(String(50), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=ACTIVE)
    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)


class StudentGuardian(Base):
    __tablename__ = "student_guardians"

    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    guardian_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("guardians.id"), nullable=False)
    relation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_primary: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)

    __table_args__ = (PrimaryKeyConstraint("student_id", "guardian_id"),)
