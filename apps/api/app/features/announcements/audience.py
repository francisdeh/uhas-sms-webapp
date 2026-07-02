"""Announcement audience string parser.

The `announcements.audience` column stores a compact string that
describes who the announcement is for:

  * `"all"`              — the whole school
  * `"division:<name>"`  — one division (e.g. `"division:JHS"`)
  * `"class:<uuid>"`     — one class

Prefixes are exposed as Final constants so producers + consumers use the
same tokens. This mirrors `apps/web/src/features/announcements/types.ts`
so both sides agree on the format.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final
from uuid import UUID

AUDIENCE_ALL: Final = "all"
DIVISION_PREFIX: Final = "division:"
CLASS_PREFIX: Final = "class:"


@dataclass(frozen=True)
class AllAudience:
    pass


@dataclass(frozen=True)
class DivisionAudience:
    division: str


@dataclass(frozen=True)
class ClassAudience:
    class_id: str


ParsedAudience = AllAudience | DivisionAudience | ClassAudience


def parse_audience(audience: str) -> ParsedAudience:
    """Loose parse — never raises. Unknown/malformed values fall back
    to `AllAudience`; matches the TS behaviour where corrupt legacy
    rows still show up in the school-wide feed rather than 500'ing."""
    if audience == AUDIENCE_ALL:
        return AllAudience()
    if audience.startswith(DIVISION_PREFIX):
        return DivisionAudience(division=audience[len(DIVISION_PREFIX) :])
    if audience.startswith(CLASS_PREFIX):
        return ClassAudience(class_id=audience[len(CLASS_PREFIX) :])
    return AllAudience()


def format_all() -> str:
    return AUDIENCE_ALL


def format_division(division: str) -> str:
    return f"{DIVISION_PREFIX}{division}"


def format_class(class_id: UUID | str) -> str:
    return f"{CLASS_PREFIX}{class_id}"
