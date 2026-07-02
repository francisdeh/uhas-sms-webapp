"""SQLAlchemy models for Exams + Scores.

An `Exam` is a school-wide instance (e.g. "Term 2 Mid-Term 2025/2026").
Scores are per (exam, student, subject) with a natural unique key —
computed columns (`total_score`, `grade`, `interpretation`,
`subject_position`) are materialised on write.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    is_published: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class Score(Base):
    __tablename__ = "scores"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    exam_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("exams.id"), nullable=False)
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)

    # Raw component scores — each is 0-100 or NULL. NULL means
    # "not entered" (missing vs. zero has semantic meaning on the
    # report card).
    cat1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cat2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    project_work: Mapped[int | None] = mapped_column(Integer, nullable=True)
    group_work: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exam_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Materialised on write by the service — see
    # `app.features.exams.service.ScoresService.upsert_batch`.
    total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grade: Mapped[str | None] = mapped_column(String(5), nullable=True)
    interpretation: Mapped[str | None] = mapped_column(String(50), nullable=True)
    subject_position: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", "subject_id", name="scores_natural_key"),
    )
