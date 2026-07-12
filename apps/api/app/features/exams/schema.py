"""Pydantic schemas for Exams + Scores."""

from __future__ import annotations

from datetime import date, datetime
from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.features.exams.constants import (
    BatchJobStatus,
    ClassReportStatus,
    ConductTrait,
    ExamType,
    KgDomain,
    Rating,
    ScoreEntryStatus,
)
from app.features.schools.schema import GradingBand

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


# ─── Class-report workflow ───────────────────────────────────────────────────


class StudentRemarkRead(BaseModel):
    """One per-student remark inside a class-report."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    student_first_name: str
    student_last_name: str
    text: str | None = None
    kg_observations: dict[KgDomain, Rating] | None = None
    conduct_ratings: dict[ConductTrait, Rating] | None = None
    interests_co_curricular: str | None = None
    updated_at: datetime | None = None


class ClassReportListItem(BaseModel):
    """Row in `GET /exams/{id}/class-reports` — the workflow header for
    one class, no remarks joined."""

    model_config = _CAMEL_CONFIG

    id: UUID
    exam_id: UUID
    class_id: UUID
    class_name: str
    division: str
    status: ClassReportStatus
    submitted_by_id: UUID | None = None
    submitted_at: datetime | None = None
    hos_comment: str | None = None
    updated_at: datetime | None = None


class ClassReportRead(BaseModel):
    """`GET /exams/{id}/class-reports/{class_id}` detail — report header
    + every remark row for the class's active roster (one per student,
    even if no remark saved yet)."""

    model_config = _CAMEL_CONFIG

    id: UUID | None = None
    exam_id: UUID
    class_id: UUID
    class_name: str
    division: str
    status: ClassReportStatus
    submitted_by_id: UUID | None = None
    submitted_at: datetime | None = None
    hos_comment: str | None = None
    remarks: list[StudentRemarkRead]
    updated_at: datetime | None = None


class RemarkInput(BaseModel):
    """One row of the PUT /draft payload."""

    model_config = _CAMEL_CONFIG

    student_id: UUID
    text: str = Field("", max_length=1000)
    # KG-only; ignored (not persisted as an error, just harmless) if
    # sent for a non-KG student — the service doesn't re-validate
    # division here, keeping this schema division-agnostic.
    kg_observations: dict[KgDomain, Rating] | None = None
    conduct_ratings: dict[ConductTrait, Rating] | None = None
    interests_co_curricular: str = Field("", max_length=1000)


class ClassReportUpsertRequest(BaseModel):
    """`PUT /exams/{id}/class-reports/{class_id}/draft` body. Remarks are
    the FULL set for the class — anything not in the array is deleted."""

    model_config = _CAMEL_CONFIG

    hos_comment: str | None = Field(None, max_length=2000)
    remarks: list[RemarkInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def _unique_student_ids(self) -> Self:
        seen: set[UUID] = set()
        for r in self.remarks:
            if r.student_id in seen:
                raise ValueError(f"Duplicate studentId in payload: {r.student_id}")
            seen.add(r.student_id)
        return self


class HosCommentUpdate(BaseModel):
    """`PATCH /exams/{id}/class-reports/{class_id}/hos-comment` body."""

    model_config = _CAMEL_CONFIG

    hos_comment: str | None = Field(None, max_length=2000)


class ClassReportListResponse(BaseModel):
    model_config = _CAMEL_CONFIG

    items: list[ClassReportListItem]


# ─── Score-entry completeness ────────────────────────────────────────────────


class ScoreCompletenessRow(BaseModel):
    """One subject of a class: how many of the roster the subject teacher
    has graded for this exam, so a class teacher can chase what's missing."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    subject_name: str
    teacher_id: UUID | None = None
    teacher_name: str | None = None  # null → subject assigned no teacher
    entered_count: int
    roster_count: int
    status: ScoreEntryStatus


class ScoreCompletenessResponse(BaseModel):
    """`GET /exams/{id}/score-completeness/{class_id}` — per-subject score-
    entry status for one class + exam."""

    model_config = _CAMEL_CONFIG

    exam_id: UUID
    class_id: UUID
    class_name: str
    roster_count: int
    subjects: list[ScoreCompletenessRow]


# ─── Report card ─────────────────────────────────────────────────────────────


class ReportCardStudent(BaseModel):
    """Student header on the printed report card."""

    model_config = _CAMEL_CONFIG

    id: UUID
    slug: str
    first_name: str
    middle_name: str | None = None
    last_name: str
    gender: str | None = None
    division: str
    class_name: str


class ReportCardExam(BaseModel):
    """Exam header — the assembled card is always for exactly one exam."""

    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    type: ExamType
    term: int
    academic_year: str
    is_published: bool


class ReportCardScoreRow(BaseModel):
    """One printed subject row on the report card."""

    model_config = _CAMEL_CONFIG

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
    # Class average for this subject/exam — null for a class with no
    # other scored students besides this one row's own missing data
    # case (never null just because the row itself lacks a score).
    class_average: float | None = None


class ReportCardSchool(BaseModel):
    """School masthead — name + logo."""

    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    logo_url: str | None = None


class ReportCardResponse(BaseModel):
    """`GET /students/{id}/report-card?examId=` — everything the FE
    needs to render the printed card in a single fetch."""

    model_config = _CAMEL_CONFIG

    student: ReportCardStudent
    exam: ReportCardExam
    school: ReportCardSchool
    scores: list[ReportCardScoreRow]
    # Resolved grade bands (school's custom bands, or the GES defaults if
    # unset) — the same bands `compute_grade` used when these scores were
    # last saved. Lets the printed grading-key legend match the school's
    # actual configuration instead of hardcoding the default 9 bands.
    grading_bands: list[GradingBand]
    aggregate: int | None = None
    class_teachers: list[str]
    class_teacher_remark: str | None = None
    head_of_school_comment: str | None = None
    # KG only — populated instead of `scores` when the student's class
    # division is KG (see `ReportCardService.get`); null for everyone
    # else. Conduct/interests apply to every division.
    kg_observations: dict[KgDomain, Rating] | None = None
    conduct_ratings: dict[ConductTrait, Rating] | None = None
    interests_co_curricular: str | None = None
    # Term boundary dates, sourced from `school_terms`: vacation = the
    # exam term's end date; reopening = the next term's start date (term 3
    # rolls to next academic year's term 1). Null when the term row or its
    # date isn't set — the card omits the line rather than failing.
    vacation_date: date | None = None
    reopening_date: date | None = None


# ─── Batch report-card print ─────────────────────────────────────────────────


class ReportCardBatchJobRead(BaseModel):
    """`POST`/`GET .../report-cards/batch` — status of the latest batch-
    print job for one (exam, class). `download_url` is a freshly-minted
    signed URL, only present once `status == "complete"`."""

    model_config = _CAMEL_CONFIG

    id: UUID
    exam_id: UUID
    class_id: UUID
    status: BatchJobStatus
    download_url: str | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
