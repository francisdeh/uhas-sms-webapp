"""Pydantic schemas for the Promotions HTTP layer.

Nothing here holds business logic — every schema is a read/write shape
for one endpoint. Alias-generator gives camelCase JSON on the wire while
Python stays snake_case.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.promotions.constants import (
    DecisionKind,
    SeasonStatus,
    SubmissionStatus,
)

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


# ─── Season ─────────────────────────────────────────────────────────────────


class SeasonRead(BaseModel):
    """Current-year season row. `openedWithOverride=True` means Admin
    opened the season before the Term-3 EndOfTerm exam was published;
    UI hides algorithmic suggestions for that case.

    `hasPublishedTerm3EndOfTerm` is computed fresh on every read (not
    stored) — it reflects whether the exam is published *now*, which can
    change after the season was opened (e.g. opened with override, exam
    published later)."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    academic_year: str
    status: SeasonStatus
    opened_with_override: bool | None = None
    opened_by_id: UUID | None = None
    opened_by_name: str | None = None
    opened_at: datetime | None = None
    closed_by_id: UUID | None = None
    closed_by_name: str | None = None
    closed_at: datetime | None = None
    has_published_term3_end_of_term: bool = False


class Term3ExamStatus(BaseModel):
    """GET /promotions/term3-exam-status — available even before a
    season row exists, unlike `SeasonRead.hasPublishedTerm3EndOfTerm`.
    Lets the Admin page show the override warning before the first
    `open_season` call of the year."""

    model_config = _CAMEL_CONFIG

    has_published_term3_end_of_term: bool


class SeasonOpenRequest(BaseModel):
    """POST /promotions/season/open."""

    model_config = _CAMEL_CONFIG

    override: bool = False


class SeasonOpenResponse(BaseModel):
    """Success payload — includes the resulting season row."""

    model_config = _CAMEL_CONFIG

    opened_with_override: bool
    season: SeasonRead


# ─── Submission + decisions ─────────────────────────────────────────────────


class DecisionRead(BaseModel):
    """One row in the decisions table + the joined student's display
    fields (fetched via the repository's join)."""

    model_config = _CAMEL_CONFIG

    id: UUID
    submission_id: UUID
    student_id: UUID
    student_name: str
    student_photo_url: str | None = None
    decision: DecisionKind
    target_class_id: UUID | None = None
    reason: str | None = None
    suggested_decision: DecisionKind | None = None
    suggested_reason: str | None = None
    failed_core_subjects: int | None = None


class DecisionUpdate(BaseModel):
    """Client-side payload for one row in a save/submit request. Sent as
    `updates: [...]` on the parent request; the service PATCHes matching
    (submission_id, student_id) pairs."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    decision: DecisionKind
    target_class_id: UUID | None = None
    reason: str | None = None


class SubmissionRead(BaseModel):
    """Submission header used by list endpoints (overview / teacher /
    DH queue)."""

    model_config = _CAMEL_CONFIG

    id: UUID
    school_id: UUID
    class_id: UUID
    academic_year: str
    status: SubmissionStatus
    submitted_by_id: UUID | None = None
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None
    reviewed_by_id: UUID | None = None
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None = None


class PromotionCommentRead(BaseModel):
    """One entry in a submission's review-comment thread, with author
    display fields. Populated by `send_back` — replaces the old single
    overwriting `reviewer_comment` column."""

    model_config = _CAMEL_CONFIG

    id: UUID
    author_id: UUID
    author_name: str
    body: str
    created_at: datetime | None = None


class NextYearClassOption(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    name: str


class ClassTeacherView(BaseModel):
    model_config = _CAMEL_CONFIG

    staff_id: UUID
    staff_name: str
    is_primary: bool


class SubmissionDetail(BaseModel):
    """Full submission page — header + decisions + next-year classes
    for the class's division. Used by both teacher edit and DH review
    screens."""

    model_config = _CAMEL_CONFIG

    submission: SubmissionRead
    class_name: str
    division: Division
    next_academic_year: str
    next_year_classes: list[NextYearClassOption]
    decisions: list[DecisionRead]
    class_teachers: list[ClassTeacherView]
    comments: list[PromotionCommentRead]


class SaveDraftRequest(BaseModel):
    """PATCH /promotions/submissions/{id}/decisions."""

    model_config = _CAMEL_CONFIG

    updates: list[DecisionUpdate] = Field(default_factory=list)


class SubmitListRequest(BaseModel):
    """POST /promotions/submissions/{id}/submit."""

    model_config = _CAMEL_CONFIG

    updates: list[DecisionUpdate] = Field(default_factory=list)


class SendBackRequest(BaseModel):
    """POST /promotions/submissions/{id}/send-back."""

    model_config = _CAMEL_CONFIG

    comment: str = Field(..., min_length=1)


class EnsureSubmissionRequest(BaseModel):
    """POST /promotions/submissions/ensure."""

    model_config = _CAMEL_CONFIG

    class_id: UUID


class EnsureSubmissionResponse(BaseModel):
    model_config = _CAMEL_CONFIG

    submission_id: UUID


class BulkApproveRequest(BaseModel):
    """POST /promotions/submissions/bulk-approve."""

    model_config = _CAMEL_CONFIG

    submission_ids: list[UUID] = Field(..., min_length=1)


class BulkApproveResult(BaseModel):
    model_config = _CAMEL_CONFIG

    submission_id: UUID
    class_name: str
    success: bool
    error: str | None = None


class BulkApproveResponse(BaseModel):
    """Best-effort — each submission is attempted independently so one
    bad row (e.g. missing target class) doesn't block the rest of the
    batch."""

    model_config = _CAMEL_CONFIG

    results: list[BulkApproveResult]


# ─── List projections (overview / teacher / DH queue) ───────────────────────


class OverviewRow(BaseModel):
    """One row on the Admin overview — one per current-year class in the
    school."""

    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    division: Division
    class_teachers: list[ClassTeacherView]
    total_students: int
    decided_count: int
    submission: SubmissionRead | None = None


class OverviewResponse(Paginated[OverviewRow]):
    """Paginated wrapper — even though every list currently fits on one
    page, staying paginated matches the rest of the API."""


class TeacherClassRow(BaseModel):
    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    division: Division
    is_primary: bool
    total_students: int
    submission: SubmissionRead | None = None


class TeacherClassesResponse(Paginated[TeacherClassRow]):
    pass


class DeputyHeadQueueRow(BaseModel):
    model_config = _CAMEL_CONFIG

    submission: SubmissionRead
    class_id: UUID
    class_name: str
    division: Division
    class_teacher_names: list[str]


class DeputyHeadQueueResponse(Paginated[DeputyHeadQueueRow]):
    pass
