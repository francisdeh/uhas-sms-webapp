"""SQLAlchemy models for the Classes domain.

Owns three related tables:
  - `classes`         — a class like "JHS 1" in AY 2025/2026
  - `class_subjects`  — subjects taught in that class (+ optional teacher)
  - `class_teachers`  — staff assigned to that class (form teacher etc.)

The Class model previously lived under `students/model.py` as a
read-only stub for the enrollment join; it moves here as its own
feature owns it. Downstream imports need to update to
`app.features.classes.model.Class`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, PrimaryKeyConstraint, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Class(Base):
    __tablename__ = "classes"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    division: Mapped[str] = mapped_column(String(50), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)


class ClassSubject(Base):
    """Junction: a subject is taught in a class, optionally by a teacher."""

    __tablename__ = "class_subjects"

    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)
    teacher_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)

    __table_args__ = (PrimaryKeyConstraint("class_id", "subject_id"),)


class ClassTeacher(Base):
    """Junction: a staff member is assigned to a class (form teacher etc.)."""

    __tablename__ = "class_teachers"

    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    staff_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    is_primary: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)

    __table_args__ = (PrimaryKeyConstraint("class_id", "staff_id"),)
