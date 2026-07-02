"""Closed set of `subjects.category` values.

Kept in its own module (rather than inline in `schema.py`) so cross-
feature callers — most notably the Promotions suggestion algorithm —
can import the constants without pulling in the whole Pydantic layer.
"""

from __future__ import annotations

from typing import Final, Literal

CORE: Final = "Core"
ELECTIVE: Final = "Elective"
OPTIONAL: Final = "Optional"

SubjectCategory = Literal["Core", "Elective", "Optional"]
