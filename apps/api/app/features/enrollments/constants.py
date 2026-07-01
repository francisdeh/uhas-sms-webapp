"""Closed set of enrollment status values.

The transitions map to real events:

  Active     → default for a fresh enrollment (from student registration
               or successful promotion).
  Repeating  → student is repeating the class; promotion workflow sets it.
  Withdrawn  → student has left; kept as a record instead of deleted so
               historical exams + attendance stay attributable.
"""

from __future__ import annotations

from typing import Final, Literal

ACTIVE: Final = "Active"
REPEATING: Final = "Repeating"
WITHDRAWN: Final = "Withdrawn"

EnrollmentStatus = Literal["Active", "Repeating", "Withdrawn"]
