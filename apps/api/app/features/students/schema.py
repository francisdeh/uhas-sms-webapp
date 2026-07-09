"""Pydantic schemas for the Students domain.

The Read shape is enriched with the joined current-year enrollment
(className, division, classId) since the table UI shows those fields.
Create takes a `classId` that the service validates + materialises into
an Enrollment row atomically with the Student row.

camelCase wire format via `alias_generator=to_camel`; Python attributes
stay snake_case. `from_attributes=True` lets routers do
`StudentRead.model_validate(orm_row)` directly when the model has all
the read fields.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

from app.core.pagination import Paginated
from app.core.school_structure import Division
from app.features.guardians.constants import RelationType
from app.features.guardians.schema import GuardianCreate
from app.features.students.constants import BloodType, DocumentLabel

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)

Gender = Literal["Male", "Female"]


class StudentBase(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str = Field(..., min_length=1, max_length=255)
    middle_name: str | None = Field(None, max_length=255)
    last_name: str = Field(..., min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    photo_url: str | None = Field(None, max_length=500)
    phone: str | None = Field(None, max_length=50)
    address: str | None = None
    nationality: str | None = Field(None, max_length=100)
    religion: str | None = Field(None, max_length=100)


class StudentGuardianAddRequest(BaseModel):
    """Attach a guardian to a student — either link an existing guardian
    (`guardian_id`) or create a new one (`new_guardian`), never both.
    Used by `POST /students/{id}/guardians` and inline in `StudentCreate`."""

    model_config = _CAMEL_CONFIG

    relation: RelationType
    is_primary: bool = False
    guardian_id: UUID | None = None
    new_guardian: GuardianCreate | None = None

    @model_validator(mode="after")
    def _exactly_one_source(self) -> Self:
        if (self.guardian_id is None) == (self.new_guardian is None):
            raise ValueError("Provide exactly one of guardianId or newGuardian.")
        return self


class StudentGuardianUpdateRequest(BaseModel):
    """Edit an existing student↔guardian link — relation and/or primary."""

    model_config = _CAMEL_CONFIG

    relation: RelationType | None = None
    is_primary: bool | None = None


class StudentCreate(StudentBase):
    """Inbound payload for `POST /students`.

    `class_id` triggers the initial Enrollment row. `dob` and `gender`
    are required on create (the report card needs them) even though
    they're optional in `StudentBase` for read-shape flexibility.
    `guardians` links (or creates) the student's guardians in the same
    transaction — registration captures at least one.
    """

    class_id: UUID
    dob: date
    gender: Gender
    guardians: list[StudentGuardianAddRequest] = Field(default_factory=list)


class StudentUpdate(BaseModel):
    model_config = _CAMEL_CONFIG

    first_name: str | None = Field(None, min_length=1, max_length=255)
    middle_name: str | None = Field(None, max_length=255)
    last_name: str | None = Field(None, min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    phone: str | None = Field(None, max_length=50)
    address: str | None = None
    nationality: str | None = Field(None, max_length=100)
    religion: str | None = Field(None, max_length=100)
    photo_url: str | None = Field(None, max_length=500)


class StudentRead(StudentBase):
    """Read shape — student row + the joined current-year enrollment.

    `class_id` / `class_name` / `division` come from the enrollments
    table. They're `None` for students who have no active enrollment
    in the current academic year (inactive students, mid-promotion).

    Deliberately excludes medical info: `GET /students/{id}` has no
    role/ownership gate (any authenticated user in the school can fetch
    any student), so anything sensitive lives behind its own gated
    endpoint instead — see `StudentMedicalRead` / `GET
    /students/{id}/medical`.
    """

    id: UUID
    slug: str
    school_id: UUID
    is_active: bool | None = True
    created_at: datetime | None = None
    class_id: UUID | None = None
    class_name: str | None = None
    division: Division | None = None


class StudentMedicalRead(BaseModel):
    """`GET /students/{id}/medical` — gated separately from the base
    student read (see `StudentRead` docstring): Admin, Deputy (own
    division), Teacher (teaches the student), or the student's own
    parent."""

    model_config = _CAMEL_CONFIG

    blood_type: BloodType | None = None
    medical_notes: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None


class StudentMedicalUpdate(BaseModel):
    """`PATCH /students/{id}/medical` — Admin or the student's own
    parent. Separate from `StudentUpdate` since it has a different
    access gate (a parent may edit this but nothing else on the
    student record)."""

    model_config = _CAMEL_CONFIG

    blood_type: BloodType | None = None
    medical_notes: str | None = None
    emergency_contact_name: str | None = Field(None, max_length=255)
    emergency_contact_phone: str | None = Field(None, max_length=50)


class StudentDocumentCreate(BaseModel):
    """`POST /students/{id}/documents` — Admin/Deputy only."""

    model_config = _CAMEL_CONFIG

    label: DocumentLabel
    other_label: str | None = Field(None, max_length=255)
    storage_path: str = Field(..., max_length=500)

    @model_validator(mode="after")
    def _other_label_only_when_other(self) -> Self:
        if self.label == "Other" and not self.other_label:
            raise ValueError('otherLabel is required when label is "Other".')
        if self.label != "Other" and self.other_label:
            raise ValueError('otherLabel must be omitted unless label is "Other".')
        return self


class StudentDocumentRead(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    student_id: UUID
    label: DocumentLabel
    other_label: str | None = None
    storage_path: str
    uploaded_by_id: UUID
    uploaded_by_name: str
    created_at: datetime | None = None


class StudentsListResponse(Paginated[StudentRead]):
    """Paged student list. See `app.core.pagination.Paginated`."""


class GuardianChildrenResponse(BaseModel):
    """Plain array on the wire — a guardian's child count is always small,
    unpaginated matches the rest of the API's small fixed-set responses."""

    model_config = _CAMEL_CONFIG

    items: list[StudentRead]


class StudentGuardianRead(BaseModel):
    """One linked guardian, as seen from the student side — includes the
    `relation` + `is_primary` fields that live on the `student_guardians`
    join row."""

    model_config = _CAMEL_CONFIG

    id: UUID
    slug: str
    name: str
    relationship: str
    is_primary: bool = False
    has_login: bool = False
    is_staff: bool = False
    phone: str | None = None
    email: str | None = None


class SiblingRead(BaseModel):
    """A student who shares at least one guardian with the subject student."""

    model_config = _CAMEL_CONFIG

    id: UUID
    slug: str
    name: str
    class_name: str | None = None
