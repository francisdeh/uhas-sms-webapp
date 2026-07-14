"""Unit tests for `resolve_current_term` — pure function, no DB needed."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.features.school_terms.model import SchoolTerm
from app.features.schools.model import School
from app.features.schools.term_resolver import resolve_current_term


def _school(*, current_term: int = 1, override: int | None = None) -> School:
    return School(
        id=uuid4(),
        slug="test-school",
        name="Test School",
        academic_year="2025/2026",
        current_term=current_term,
        current_term_override=override,
    )


def _term(term: int, start: date, end: date, *, year: str = "2025/2026") -> SchoolTerm:
    return SchoolTerm(
        id=uuid4(),
        school_id=uuid4(),
        academic_year=year,
        term=term,
        start_date=start,
        end_date=end,
    )


TERMS = [
    _term(1, date(2025, 9, 1), date(2025, 12, 12)),
    _term(2, date(2026, 1, 5), date(2026, 4, 3)),
    _term(3, date(2026, 4, 20), date(2026, 7, 31)),
]


def test_exact_match_within_term_range() -> None:
    school = _school()
    assert resolve_current_term(school, TERMS, date(2026, 2, 1)) == 2


def test_override_wins_over_everything() -> None:
    school = _school(current_term=1, override=3)
    assert resolve_current_term(school, TERMS, date(2025, 9, 15)) == 3


def test_gap_between_terms_falls_back_to_nearest() -> None:
    """Dec 20 falls in the gap between Term 1 (ends Dec 12) and Term 2
    (starts Jan 5) — nearer to Term 1's end than Term 2's start."""
    school = _school()
    assert resolve_current_term(school, TERMS, date(2025, 12, 20)) == 1


def test_gap_nearer_to_next_term_picks_that_one() -> None:
    """Dec 30 is 1 day from Term 1's end-adjacent gap but closer to
    Term 2's Jan 5 start."""
    school = _school()
    assert resolve_current_term(school, TERMS, date(2025, 12, 31)) == 2


def test_no_terms_for_active_year_falls_back_to_stored_value() -> None:
    """New academic year with no school_terms rows configured yet —
    degrade to the legacy stored column rather than erroring."""
    school = _school(current_term=2)
    other_year_terms = [_term(1, date(2024, 9, 1), date(2024, 12, 12), year="2024/2025")]
    assert resolve_current_term(school, other_year_terms, date(2026, 1, 1)) == 2


def test_no_terms_at_all_falls_back_to_stored_value() -> None:
    school = _school(current_term=3)
    assert resolve_current_term(school, [], date(2026, 1, 1)) == 3
