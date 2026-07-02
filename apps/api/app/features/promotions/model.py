"""SQLAlchemy models for the Promotions domain.

Three tables:

  * `promotion_seasons`    — one row per (school, academic_year)
  * `promotion_submissions`— one row per (school, class, academic_year)
  * `promotion_decisions`  — one row per (submission, student)

Every state transition + FK integrity check lives in the service. The
`approve` path in `PromotionsService.approve` is transactional — closing
current-year enrolments, opening next-year enrolments, and flipping
withdrawn students to inactive all happen in one commit.

All three tables were created in the Drizzle baseline; migration
`72f4a80e3c11_promotions_indexes` layers hot-path indexes on top.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PromotionSeason(Base):
    __tablename__ = "promotion_seasons"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="closed")
    opened_with_override: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    opened_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class PromotionSubmission(Base):
    __tablename__ = "promotion_submissions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    academic_year: Mapped[str] = mapped_column(String(9), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    submitted_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("staff.id"), nullable=True
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )


class PromotionDecision(Base):
    """One row per student in a submission.

    `suggested_decision` / `suggested_reason` / `failed_core_subjects` are
    populated when `ensure_submission` runs `compute_suggestion` — they're
    NULL when the season was opened with `override` (no published Term-3
    end-of-term exam), which is the signal to the UI that the teacher
    must decide manually.
    """

    __tablename__ = "promotion_decisions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    submission_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("promotion_submissions.id"), nullable=False
    )
    student_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("students.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    target_class_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("classes.id"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    suggested_decision: Mapped[str | None] = mapped_column(String(20), nullable=True)
    suggested_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    failed_core_subjects: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
