"""SQLAlchemy models for `lesson_plans` + `lesson_plan_reviews`.

The lesson_plans row carries state + content. A dedicated
`lesson_plan_reviews` child table records every review event
(Unit Head + Deputy Head + rejection loops) so the full audit trail
survives — the earlier "single reviewer_id column that gets
overwritten" design lost the Unit Head's approval identity the
moment the Deputy Head approved.

State machine + reviewer auth live in the service, not the DB.
Soft-delete via `deleted_at` per the convention in
[docs/ENGINEERING-CONVENTIONS.md]: mutating queries filter it out,
reads exclude by default.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LessonPlan(Base):
    __tablename__ = "lesson_plans"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    teacher_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    subject_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("subjects.id"), nullable=False)
    class_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("classes.id"), nullable=False)
    term: Mapped[int] = mapped_column(Integer, nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)

    topic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    learning_objectives: Mapped[str | None] = mapped_column(Text, nullable=True)
    teaching_methods: Mapped[str | None] = mapped_column(Text, nullable=True)
    resources: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class LessonPlanReview(Base):
    """One review event on a lesson plan.

    Append-only from the service's perspective: `review()` inserts a new
    row rather than mutating an existing one, so the full history
    survives. `decision` is the target status the reviewer moved the
    plan into (`unit_head_approved`, `approved`, or `rejected`).
    """

    __tablename__ = "lesson_plan_reviews"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    lesson_plan_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("lesson_plans.id"), nullable=False
    )
    reviewer_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("staff.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(50), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), nullable=True
    )
