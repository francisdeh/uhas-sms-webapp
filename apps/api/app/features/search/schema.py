"""Pydantic schemas for the global-search endpoint.

Powers the Next-side Cmd-K command palette — one payload, three
domain arrays. camelCase on the wire matches the palette's TypeScript
types verbatim so no adapter layer sits between the network response
and the React state.
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
    from_attributes=True,
)


class StudentHit(BaseModel):
    """One student result. `class_name` is the label of the student's
    current-year Active enrollment; `None` when the student has no
    active class assigned yet."""

    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    slug: str
    # The wire key is the bare word `class` — camel-cased `className`
    # loses the meaning the palette renders. Explicit alias overrides
    # the generator for this field only.
    class_name: str | None = Field(default=None, alias="class")


class StaffHit(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    slug: str
    role: str | None = None


class ClassHit(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    name: str
    slug: str
    division: str


class FeeItemHit(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    name: str


class LessonPlanHit(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    topic: str


class SchemeHit(BaseModel):
    model_config = _CAMEL_CONFIG

    id: UUID
    title: str


class SearchResults(BaseModel):
    model_config = _CAMEL_CONFIG

    students: list[StudentHit]
    staff: list[StaffHit]
    classes: list[ClassHit]
    fee_items: list[FeeItemHit]
    lesson_plans: list[LessonPlanHit]
    schemes: list[SchemeHit]
