"""Closed set of `assignments.status` values.

Assignments have the simplest lifecycle in the domain:

    draft ──publish──► published ──unpublish──► draft

There's no reviewer step — the teacher owns the artefact. `published`
is what makes it visible to parents (and, indirectly, students).
"""

from __future__ import annotations

from typing import Final, Literal

DRAFT: Final = "draft"
PUBLISHED: Final = "published"

AssignmentStatus = Literal["draft", "published"]
