"""Pydantic schemas for the Lesson Plans domain."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.lesson_plans.constants import LessonPlanStatus

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class LessonPlanCreate(BaseModel):
    """A teacher creates a plan; status starts as `draft`. Teacher ID
    comes from the caller's JWT `linked_id` — not accepted in payload
    (per the security fix we applied on leave requests)."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    class_id: UUID
    term: int = Field(..., ge=1, le=3)
    week: int = Field(..., ge=1, le=15)
    topic: str | None = Field(None, max_length=255)
    learning_objectives: str | None = None
    teaching_methods: str | None = None
    resources: str | None = None
    assessment_plan: str | None = None
    file_url: str | None = Field(None, max_length=500)


class LessonPlanUpdate(BaseModel):
    """Teacher edits while status ∈ {draft, rejected}. Every field
    optional so a quick-save re-submit doesn't require the full body."""

    model_config = _CAMEL_CONFIG

    topic: str | None = Field(None, max_length=255)
    learning_objectives: str | None = None
    teaching_methods: str | None = None
    resources: str | None = None
    assessment_plan: str | None = None
    file_url: str | None = Field(None, max_length=500)


class LessonPlanReviewRequest(BaseModel):
    """Payload for `POST /lesson-plans/{id}/review` — the reviewer
    decides `approve` or `reject`. The service infers the resulting
    status from the reviewer's role + plan's current status."""

    model_config = _CAMEL_CONFIG

    decision: LessonPlanStatus  # one of "unit_head_approved" | "approved" | "rejected"
    comment: str | None = None


class LessonPlanRead(BaseModel):
    """Read shape includes joined display fields — teacher / subject /
    class / reviewer names — so the review-queue and teacher-list UIs
    don't need a second round trip."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    teacher_id: UUID
    teacher_first_name: str
    teacher_last_name: str
    subject_id: UUID
    subject_slug: str
    subject_name: str
    class_id: UUID
    class_name: str
    division: Division
    term: int
    week: int
    topic: str | None = None
    learning_objectives: str | None = None
    teaching_methods: str | None = None
    resources: str | None = None
    assessment_plan: str | None = None
    file_url: str | None = None
    status: LessonPlanStatus
    reviewer_comment: str | None = None
    reviewed_by_id: UUID | None = None
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LessonPlansListResponse(Paginated[LessonPlanRead]):
    """Paged list. See `app.core.pagination.Paginated`."""
