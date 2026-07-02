"""Canonical unions for the school's structural taxonomy.

Kept separate from `roles.py` (which is auth-track) because these are
academic structure — division, term, exam type, etc. — and unrelated to
who a person is or what they can do.

Any feature schema that referenced these as inline Literals should
`from app.core.school_structure import Division` instead.
"""

from __future__ import annotations

from typing import Final, Literal

Division = Literal["KG", "Lower Primary", "Upper Primary", "JHS"]
"""The four teaching divisions of UHAS Basic School. The value order is
significant: it's the traversal order for report cards, promotion
suggestions, and dashboard summaries."""

DIVISIONS: Final[tuple[Division, ...]] = (
    "KG",
    "Lower Primary",
    "Upper Primary",
    "JHS",
)
