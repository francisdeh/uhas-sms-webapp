"""Pydantic schemas for Exams + Scores."""

from __future__ import annotations

from datetime import datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.exams.constants import ExamType

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


# ─── Exam ────────────────────────────────────────────────────────────────────


class ExamBase(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str = Field(..., min_length=1, max_length=100)
    type: ExamType
    term: int = Field(..., ge=1, le=3)
    academic_year: str = Field(..., pattern=r"^\d{4}/\d{4}$")


class ExamCreate(ExamBase):
    pass


class ExamUpdate(BaseModel):
    """Partial update for an unpublished exam. Publish/unpublish is a
    separate action endpoint — this only touches metadata."""

    model_config = _CAMEL_CONFIG

    name: str | None = Field(None, min_length=1, max_length=100)
    type: ExamType | None = None
    term: int | None = Field(None, ge=1, le=3)
    academic_year: str | None = Field(None, pattern=r"^\d{4}/\d{4}$")


class ExamRead(ExamBase):
    id: UUID
    school_id: UUID
    is_published: bool
    published_at: datetime | None = None
    created_at: datetime | None = None


class ExamsListResponse(Paginated[ExamRead]):
    """Paged exam list. See `app.core.pagination.Paginated`."""


# ─── Score ───────────────────────────────────────────────────────────────────


class ScoreInput(BaseModel):
    """One row of the batch payload — teacher's picture of one student's
    scores for a subject. All components nullable (partial saves during
    grading are the norm)."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    cat1: int | None = Field(None, ge=0, le=100)
    cat2: int | None = Field(None, ge=0, le=100)
    project_work: int | None = Field(None, ge=0, le=100)
    group_work: int | None = Field(None, ge=0, le=100)
    exam_score: int | None = Field(None, ge=0, le=100)


class ScoresUpsertRequest(BaseModel):
    """`PUT /exams/{id}/scores` — one subject's grid for one class.

    The service loads the class + subject + exam, upserts each row,
    recomputes totals/grades, and reranks positions in the same
    transaction.
    """

    model_config = _CAMEL_CONFIG

    class_id: UUID
    subject_id: UUID
    records: list[ScoreInput] = Field(..., min_length=1)

    @model_validator(mode="after")
    def _unique_student_ids(self) -> Self:
        seen: set[UUID] = set()
        for r in self.records:
            if r.student_id in seen:
                raise ValueError(f"Duplicate studentId in payload: {r.student_id}")
            seen.add(r.student_id)
        return self


class ScoreRead(BaseModel):
    """Read shape — includes joined student + subject display fields so
    the grid can render names, not just IDs."""

    model_config = _CAMEL_CONFIG

    id: UUID
    exam_id: UUID
    student_id: UUID
    student_first_name: str
    student_last_name: str
    student_slug: str
    subject_id: UUID
    subject_slug: str
    subject_name: str
    cat1: int | None = None
    cat2: int | None = None
    project_work: int | None = None
    group_work: int | None = None
    exam_score: int | None = None
    total_score: int | None = None
    grade: str | None = None
    interpretation: str | None = None
    subject_position: int | None = None


class ScoresGridResponse(BaseModel):
    """`GET /exams/{id}/scores?classId=&subjectId=` — one grid.

    Always returns one row per student in the class (whether or not
    they have scores saved), so the frontend can render blank rows for
    students not yet graded.
    """

    model_config = _CAMEL_CONFIG

    exam_id: UUID
    class_id: UUID
    subject_id: UUID
    items: list[ScoreRead]
