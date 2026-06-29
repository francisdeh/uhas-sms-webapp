"""Pydantic schemas for the Students domain.

REFERENCE EXAMPLE. The students domain itself is not yet ported to
FastAPI — that lands in Phase 2 — but this file establishes the
naming + structure convention every feature should follow. See
[docs/ENGINEERING-CONVENTIONS.md §20-22](../../../../../docs/ENGINEERING-CONVENTIONS.md).

Naming family (`Base` / `Create` / `Update` / `Read`) is the
SQLModel / Tiangolo style — mirrors the TS `CreateStudentInput` /
`UpdateStudentInput` / `Student` types already used in apps/web.

Rules baked into this file:
  - One `schema.py` per domain, sits next to `model.py` and `service.py`.
  - `Base` carries fields shared by inbound + outbound; `Create` inherits
    + adds required-on-creation fields; `Update` does NOT inherit so the
    all-optional shape doesn't collide with `Base`'s required fields.
  - `Read` has `from_attributes=True` so routers can call
    `StudentRead.model_validate(orm_row)` directly — no manual mapping.
  - List wrappers (`StudentList`) carry `total` for pagination headers —
    skip the bare `list[StudentRead]` and the page metadata gets lost.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Gender = Literal["Male", "Female"]


class StudentBase(BaseModel):
    """Fields shared between inbound payloads and the outbound shape.

    Anything that's editable by clients AND surfaced in responses lives
    here. Server-set fields (id, school_id, created_at) belong on `Read`
    instead — clients neither send nor expect to override them.
    """

    first_name: str = Field(min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str = Field(min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    phone: str | None = Field(default=None, max_length=50)
    address: str | None = None
    nationality: str | None = Field(default=None, max_length=100)
    religion: str | None = Field(default=None, max_length=100)


class StudentCreate(StudentBase):
    """Inbound payload for `POST /students`.

    Required-on-creation fields that don't make sense to surface in the
    base shape go here. school_id is NOT in the payload — it's read from
    the JWT (`CurrentSchoolIdDep`) so the API can't be tricked into
    enrolling a student into another school.
    """

    class_id: str = Field(description="Initial class enrollment (FK to classes.id).")
    photo_url: str | None = Field(default=None, max_length=500)


class StudentUpdate(BaseModel):
    """Inbound payload for `PATCH /students/{id}`.

    Deliberately doesn't inherit `StudentBase` — Update is "any subset of
    editable fields, all optional", which doesn't compose cleanly with
    `Base`'s required fields. Repeating the field declarations is the
    accepted Pydantic idiom for partial-update shapes.

    Server-immutable fields (id, school_id, created_at) are not present.
    """

    first_name: str | None = Field(default=None, min_length=1, max_length=255)
    middle_name: str | None = Field(default=None, max_length=255)
    last_name: str | None = Field(default=None, min_length=1, max_length=255)
    dob: date | None = None
    gender: Gender | None = None
    phone: str | None = Field(default=None, max_length=50)
    photo_url: str | None = Field(default=None, max_length=500)
    address: str | None = None
    nationality: str | None = Field(default=None, max_length=100)
    religion: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None


class StudentRead(StudentBase):
    """Outbound shape for any endpoint that returns a student.

    Inherits `Base`'s editable fields and adds server-set ones. The
    `from_attributes=True` config lets routers / services validate
    SQLAlchemy rows directly without manual field-by-field mapping:

        student_row = await session.get(Student, student_id)
        return StudentRead.model_validate(student_row)
    """

    id: str
    school_id: str
    photo_url: str | None = None
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StudentList(BaseModel):
    """Paged collection response for `GET /students`.

    Always prefer this over a bare `list[StudentRead]` — even when
    pagination isn't surfaced in the UI yet, the `total` field lets
    callers display "X of Y" and gives us headroom for cursor-based
    pagination later without changing the response shape.
    """

    items: list[StudentRead]
    total: int = Field(description="Total matching the query, before pagination.")
