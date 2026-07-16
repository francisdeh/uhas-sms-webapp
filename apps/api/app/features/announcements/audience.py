"""Announcement audience string parser.

The `announcements.audience` column stores a compact string that
describes who the announcement is for:

  * `"all"`               — the whole school
  * `"all:staff"`         — every staff member, no parents
  * `"division:<name>"`   — one division (e.g. `"division:JHS"`)
  * `"division:<name>:staff"` — one division's staff only, no parents
  * `"class:<uuid>"`      — one class (parents only — there's no staff
    equivalent; class-scoped staff comms happen via assignments +
    attendance, not announcements)

The `:staff` suffix is a real visibility distinction, not just a
notification-channel filter — a staff-only post is invisible to
parents in the in-app feed too, not merely un-emailed to them. Create-time
role gates, list-time visibility, and the notification fan-out all key
off the same parsed value, so there's one source of truth for "who can
see this" rather than separate "who sees it" vs "who gets notified"
logic.

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
STAFF_SUFFIX: Final = ":staff"


@dataclass(frozen=True)
class AllAudience:
    staff_only: bool = False


@dataclass(frozen=True)
class DivisionAudience:
    division: str
    staff_only: bool = False


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
    if audience == f"{AUDIENCE_ALL}{STAFF_SUFFIX}":
        return AllAudience(staff_only=True)
    if audience.startswith(DIVISION_PREFIX):
        rest = audience[len(DIVISION_PREFIX) :]
        if rest.endswith(STAFF_SUFFIX):
            return DivisionAudience(division=rest[: -len(STAFF_SUFFIX)], staff_only=True)
        return DivisionAudience(division=rest)
    if audience.startswith(CLASS_PREFIX):
        return ClassAudience(class_id=audience[len(CLASS_PREFIX) :])
    return AllAudience()


def format_all(*, staff_only: bool = False) -> str:
    return f"{AUDIENCE_ALL}{STAFF_SUFFIX}" if staff_only else AUDIENCE_ALL


def format_division(division: str, *, staff_only: bool = False) -> str:
    suffix = STAFF_SUFFIX if staff_only else ""
    return f"{DIVISION_PREFIX}{division}{suffix}"


def format_class(class_id: UUID | str) -> str:
    return f"{CLASS_PREFIX}{class_id}"
