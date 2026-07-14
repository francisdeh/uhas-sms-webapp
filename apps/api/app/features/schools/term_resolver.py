"""Resolve a school's effective "current term" from real term dates.

`schools.current_term` used to be the sole, manually-set source of truth
for "what term is it" — nothing else consumed it, despite the earlier
Settings-page spec calling for a date-based auto-pick. This module is
that auto-pick: given the school's `school_terms` rows for its active
academic year and today's date, resolve which term we're actually in,
falling back gracefully (never raising) when data is incomplete.
"""

from __future__ import annotations

from datetime import date

from app.features.school_terms.model import SchoolTerm
from app.features.schools.model import School


def resolve_current_term(school: School, terms: list[SchoolTerm], today: date) -> int:
    """Effective current term for `school`, in priority order:

    1. `school.current_term_override`, if an Admin pinned one.
    2. Whichever of `terms` (already filtered or not — this filters by
       `school.academic_year` itself) has `start_date <= today <= end_date`.
    3. The term whose date range is nearest to `today`, if the active year
       has *some* term dates configured but none contains today (e.g. a
       gap between terms, or today falling before/after the school year).
    4. `school.current_term` (the legacy column) as a last resort, when
       the active year has no `school_terms` rows configured at all yet.
    """
    if school.current_term_override is not None:
        return school.current_term_override

    candidates = [t for t in terms if t.academic_year == school.academic_year]
    if not candidates:
        return school.current_term

    for t in candidates:
        if t.start_date <= today <= t.end_date:
            return t.term

    def distance(t: SchoolTerm) -> int:
        if today < t.start_date:
            return (t.start_date - today).days
        return (today - t.end_date).days

    return min(candidates, key=distance).term
