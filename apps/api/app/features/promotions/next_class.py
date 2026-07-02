"""Next-level class resolution for the Promote / Repeat paths.

Basic-school single-stream sequence — no cross-division jumps. Mirrors
`apps/web/src/features/promotions/lib/next-class-resolver.ts` so both
sides pick the same target class from the same candidate list.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final
from uuid import UUID

from app.features.promotions.constants import DEC_PROMOTE

# Terminal class in the basic-school sequence. Exposed as a Final so the
# JHS-3-→-graduate rule in `suggestion.py` can key off the same string
# instead of duplicating the literal.
JHS_3: Final = "JHS 3"

_SEQUENCE: list[str] = [
    "KG 1",
    "KG 2",
    "Primary 1",
    "Primary 2",
    "Primary 3",
    "Primary 4",
    "Primary 5",
    "Primary 6",
    "JHS 1",
    "JHS 2",
    JHS_3,
]


@dataclass(frozen=True)
class ClassLike:
    """Minimal shape needed to auto-pick a class. Matches both the SQLA
    Class model and the manual dicts we use inside tests."""

    id: UUID | str
    name: str
    division: str


def next_level_name(current_class_name: str) -> str | None:
    """`"Primary 5"` → `"Primary 6"`, `"JHS 1"` → `"JHS 2"`. `JHS 3` has no
    successor (it graduates)."""
    try:
        idx = _SEQUENCE.index(current_class_name)
    except ValueError:
        return None
    if idx == len(_SEQUENCE) - 1:
        return None
    return _SEQUENCE[idx + 1]


def same_level_name(current_class_name: str) -> str:
    """Repeat path — literally the same level again."""
    return current_class_name


def auto_pick_target_class(
    current_class_name: str,
    candidate_classes: Iterable[ClassLike],
    mode: str,
) -> UUID | str | None:
    """Given the current class's *name* and next-year candidates, return
    the id of the class whose `name` matches the promote/repeat target.

    `mode` accepts the same string values as `DecisionKind` — pass
    `DEC_PROMOTE` or `DEC_REPEAT` from `promotions.constants` at the
    call site. Anything other than `DEC_PROMOTE` is treated as the
    repeat/same-level path (defensive fallback; the service only ever
    passes those two constants today).

    Single-stream basic schools have at most one candidate per level, so
    a name match is sufficient. Returns `None` if there's no candidate
    for the derived name — the caller then leaves `target_class_id`
    unset and the teacher picks manually.
    """
    target = (
        next_level_name(current_class_name)
        if mode == DEC_PROMOTE
        else same_level_name(current_class_name)
    )
    if target is None:
        return None
    for c in candidate_classes:
        if c.name == target:
            return c.id
    return None


def division_has_next_year_classes(division: str, candidate_classes: Iterable[ClassLike]) -> bool:
    """Pre-flight for `submit`: refuse if Admin hasn't set up next-year
    classes for this division yet."""
    return any(c.division == division for c in candidate_classes)
