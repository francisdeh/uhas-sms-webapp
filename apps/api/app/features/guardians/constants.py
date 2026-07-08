"""Closed set of guardian↔student `relation` values.

The `student_guardians.relation` column stays a free `varchar(50)` in the
DB, but the API constrains inbound values to this set so relation data
stays consistent + display-friendly. Mirror the TS union in
[apps/web/src/features/students/types.ts](../../../../web/src/features/students/types.ts)
when this changes.
"""

from __future__ import annotations

from typing import Final, Literal

RelationType = Literal[
    "Mother",
    "Father",
    "Guardian",
    "Grandparent",
    "Aunt",
    "Uncle",
    "Other",
]

RELATION_TYPES: Final[tuple[str, ...]] = (
    "Mother",
    "Father",
    "Guardian",
    "Grandparent",
    "Aunt",
    "Uncle",
    "Other",
)
