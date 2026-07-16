"""Pydantic schemas for the Classes domain (+ its two junctions)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)

# ─── Class ───────────────────────────────────────────────────────────────────


class ClassBase(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str = Field(..., min_length=1, max_length=50)
    division: Division
    academic_year: str = Field(..., pattern=r"^\d{4}/\d{4}$")


class ClassCreate(ClassBase):
    """Client passes a canonical slug; service uppercases + validates uniqueness."""

    slug: str = Field(..., min_length=1, max_length=50)


class ClassUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    name: str | None = Field(None, min_length=1, max_length=50)
    division: Division | None = None


class ClassRead(ClassBase):
    id: UUID
    slug: str
    school_id: UUID
    # Denormalised for the list UI — cheap to compute in the same query
    # and saves the frontend from N per-row lookups.
    student_count: int | None = 0
    primary_teacher_name: str | None = None


class ClassesListResponse(Paginated[ClassRead]):
    """Paged class list. See `app.core.pagination.Paginated`."""


# ─── ClassSubject junction ───────────────────────────────────────────────────


class ClassSubjectAssignRequest(BaseModel):
    """`POST /classes/{class_id}/subjects` — assign a subject (opt. teacher)."""

    model_config = _CAMEL_CONFIG

    subject_id: UUID
    teacher_id: UUID | None = None


class ClassSubjectTeacherUpdate(BaseModel):
    """`PATCH /classes/{class_id}/subjects/{subject_id}` — set/unset teacher.

    Pass `teacherId: null` to unassign; a missing key is treated as a
    no-op (uses `exclude_unset`).
    """

    model_config = _CAMEL_CONFIG

    teacher_id: UUID | None = None


class ClassSubjectRead(BaseModel):
    """A row of `class_subjects` — the joined subject + optional teacher name.

    The frontend renders the class detail page from this shape; the
    embedded `subjectName` / `teacherName` save it a second round trip.
    """

    model_config = _CAMEL_CONFIG

    class_id: UUID
    subject_id: UUID
    subject_slug: str
    subject_name: str
    teacher_id: UUID | None = None
    teacher_first_name: str | None = None
    teacher_last_name: str | None = None


class ClassSubjectsListResponse(BaseModel):
    """Non-paged wrapper — a class has at most ~10 subjects."""

    model_config = _CAMEL_CONFIG

    items: list[ClassSubjectRead]


# ─── Cross-class lookups on class_subjects ───────────────────────────────────


class ClassSubjectLookupRow(BaseModel):
    """A `class_subjects` row enriched with class + subject + teacher labels.

    Powers the inverse lookups: "which classes teach subject X" and
    "which class-subject rows is teacher Y assigned to". Different
    shape from `ClassSubjectRead` because the caller cares about the
    class labels (name/slug/division), not the join key.

    Note: `class_subjects` has no scalar PK — the PK is composite
    `(class_id, subject_id)`. The pair itself uniquely identifies a
    row, so no synthetic id is included.
    """

    model_config = _CAMEL_CONFIG

    class_id: UUID
    class_name: str
    class_slug: str
    division: Division
    subject_id: UUID
    subject_name: str
    subject_slug: str
    teacher_id: UUID | None = None
    teacher_name: str | None = None


class ClassSubjectLookupResponse(BaseModel):
    """Non-paged wrapper — a subject or a teacher is typically in <20 classes."""

    model_config = _CAMEL_CONFIG

    rows: list[ClassSubjectLookupRow]


# ─── ClassTeacher junction ───────────────────────────────────────────────────


class ClassTeacherAssignRequest(BaseModel):
    model_config = _CAMEL_CONFIG

    staff_id: UUID
    is_primary: bool = False


class ClassPrimaryTeacherUpdate(BaseModel):
    """`PUT /classes/{id}/teachers/primary` — atomically swap whichever
    staff member currently holds `is_primary=True` for a new one (or
    `null` to just clear it). Replaces the two-call client-orchestrated
    "remove old, then assign new" sequence, which could leave a class
    with no teacher at all if the second call failed after the first
    succeeded.
    """

    model_config = _CAMEL_CONFIG

    staff_id: UUID | None


class ClassTeacherRead(BaseModel):
    """A row of `class_teachers` with embedded staff name."""

    model_config = _CAMEL_CONFIG

    class_id: UUID
    staff_id: UUID
    staff_first_name: str
    staff_last_name: str
    is_primary: bool


class ClassTeachersListResponse(BaseModel):
    """Non-paged wrapper — small list."""

    model_config = _CAMEL_CONFIG

    items: list[ClassTeacherRead]
