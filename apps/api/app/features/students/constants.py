"""Domain constants for the Students feature.

Bare string literals like `"Active"` in SQL filters and ORM defaults
are easy to typo and impossible to grep with confidence — these
constants give us one authoritative source and let the `Literal` type
drive autocomplete + exhaustiveness checks.

Pattern matches `app.core.roles` — keep new domain enums in a similar
`constants.py` next to their model rather than reaching for a central
enums file. Cross-cutting (`Role`) lives in `app.core`; domain-local
lives next to the domain.
"""

from __future__ import annotations

from typing import Final, Literal

# Enrollment lifecycle states. The set is closed today (Active /
# Repeating); Withdraw is modelled as `students.is_active=False` rather
# than a third enrollment row, so it isn't in this enum.
ACTIVE: Final = "Active"
REPEATING: Final = "Repeating"

EnrollmentStatus = Literal["Active", "Repeating"]
"""The closed set of values the `enrollments.status` column accepts."""
