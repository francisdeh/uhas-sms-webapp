"""Pydantic schemas for the SchoolTerms sub-resource.

Three terms per (school, academic_year) — the schema enforces this
via a model-level validator on the upsert request. Frontend may edit
all three at once (the Calendar tab's natural unit of work) so the
PUT endpoint accepts a list, not single rows.

Per the convention in
[docs/ENGINEERING-CONVENTIONS.md §20](../../../../../docs/ENGINEERING-CONVENTIONS.md):
`Base` / `Update` / `Read` naming; camelCase wire format via
`alias_generator=to_camel`.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

# Same camelCase wire-format config as the schools module.
_CAMEL_CONFIG = ConfigDict(
    alias_generator=to_camel,
    populate_by_name=True,
)

# Academic year format `YYYY/YYYY` — matches the DB CHECK constraint.
_ACADEMIC_YEAR_RE = r"^\d{4}/\d{4}$"


class TermInput(BaseModel):
    """One row in the upsert payload — no id (server upserts by natural key)."""

    model_config = _CAMEL_CONFIG

    term: Annotated[int, Field(ge=1, le=3)]
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _end_after_start(self) -> TermInput:
        if self.end_date < self.start_date:
            raise ValueError(
                f"Term {self.term}: end date ({self.end_date}) is before "
                f"start date ({self.start_date}).",
            )
        return self


class TermsUpsertRequest(BaseModel):
    """Payload for `PUT /school/terms` — replaces all 3 terms for a year.

    The Calendar tab edits all three terms as one unit of work, so the
    API mirrors that: send the full set, server upserts atomically.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )

    academic_year: Annotated[str, Field(pattern=_ACADEMIC_YEAR_RE)]
    terms: list[TermInput]

    @model_validator(mode="after")
    def _three_distinct_terms(self) -> TermsUpsertRequest:
        if len(self.terms) != 3:
            raise ValueError(f"Expected exactly 3 terms (got {len(self.terms)}).")
        term_numbers = {t.term for t in self.terms}
        if term_numbers != {1, 2, 3}:
            raise ValueError(
                f"Terms must be 1, 2, and 3 (got {sorted(term_numbers)}).",
            )
        return self


class TermRead(BaseModel):
    """Outbound representation of a single school_terms row."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: UUID
    school_id: UUID
    academic_year: str
    term: int
    start_date: date
    end_date: date


class TermsListResponse(BaseModel):
    """Wrapper for `GET /school/terms` — keeps room for future metadata
    (counts, last-updated timestamps) without breaking the wire format."""

    model_config = _CAMEL_CONFIG

    items: list[TermRead]
