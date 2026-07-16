"""Unit tests for the compute module — pure functions, no DB."""

from __future__ import annotations

from uuid import uuid4

from app.features.exams.compute import (
    ComponentScores,
    assign_positions,
    compute_aggregate,
    compute_grade,
    compute_total,
)

# ─── compute_total ───────────────────────────────────────────────────────────


def test_midterm_returns_raw_exam_score() -> None:
    row = ComponentScores(exam_score=72, cat1=10, cat2=15)
    # MidTerm ignores components; 72 rounds to 72.
    assert compute_total("MidTerm", row) == 72


def test_midterm_returns_none_when_exam_score_missing() -> None:
    assert compute_total("MidTerm", ComponentScores(cat1=80, cat2=90)) is None


def test_endofterm_applies_default_weights() -> None:
    """Default weights: 10/10/10/10/60. Perfect 100 across all → 100."""
    perfect = ComponentScores(cat1=100, cat2=100, project_work=100, group_work=100, exam_score=100)
    assert compute_total("EndOfTerm", perfect) == 100


def test_endofterm_missing_components_count_as_zero() -> None:
    """Only exam=80 → 80 * 60 / 100 = 48."""
    exam_only = ComponentScores(exam_score=80)
    assert compute_total("EndOfTerm", exam_only) == 48


def test_endofterm_returns_none_when_no_components_entered() -> None:
    assert compute_total("EndOfTerm", ComponentScores()) is None


def test_endofterm_accepts_custom_weights() -> None:
    """Custom 50/50 across exam+cat1 (no other components used)."""
    row = ComponentScores(cat1=60, exam_score=80)
    weights = {"cat1": 50, "cat2": 0, "groupWork": 0, "projectWork": 0, "exam": 50}
    # 60*50 + 80*50 = 7000 / 100 = 70.
    assert compute_total("EndOfTerm", row, weights=weights) == 70


# ─── compute_grade ───────────────────────────────────────────────────────────


def test_grade_bands_map_scores_to_grade_and_interpretation() -> None:
    assert compute_grade(95) == ("1", "Highest")
    assert compute_grade(85) == ("2", "Higher")
    assert compute_grade(72) == ("3", "High")
    assert compute_grade(60) == ("4", "High Average")
    assert compute_grade(55) == ("5", "Average")
    assert compute_grade(50) == ("6", "Lower Average")
    assert compute_grade(42) == ("7", "Low")
    assert compute_grade(35) == ("8", "Lower")
    assert compute_grade(10) == ("9", "Lowest")


def test_grade_boundaries_are_inclusive() -> None:
    # 89 is still "Higher"; 90 flips to "Highest".
    assert compute_grade(89) == ("2", "Higher")
    assert compute_grade(90) == ("1", "Highest")


def test_grade_custom_bands_override_defaults() -> None:
    bands = [
        {"min": 80, "max": 100, "grade": "A", "interpretation": "Distinction"},
        {"min": 0, "max": 79, "grade": "B", "interpretation": "Pass"},
    ]
    assert compute_grade(85, bands=bands) == ("A", "Distinction")
    assert compute_grade(50, bands=bands) == ("B", "Pass")


# ─── assign_positions ────────────────────────────────────────────────────────


def test_positions_use_standard_competition_ranking() -> None:
    """Ties share the lower rank; the next distinct total skips."""
    a, b, c, d = uuid4(), uuid4(), uuid4(), uuid4()
    rows: list[tuple[object, int | None]] = [(a, 100), (b, 95), (c, 95), (d, 90)]
    positions = assign_positions(rows)
    assert positions == {a: 1, b: 2, c: 2, d: 4}


def test_positions_none_totals_have_none_position() -> None:
    """Unscored students don't compete and don't push others down."""
    a, b, c = uuid4(), uuid4(), uuid4()
    rows = [(a, 80), (b, None), (c, 70)]
    positions = assign_positions(rows)
    assert positions == {a: 1, b: None, c: 2}


def test_positions_all_tied() -> None:
    """Every row at the same total → everyone position 1."""
    a, b, c = uuid4(), uuid4(), uuid4()
    rows: list[tuple[object, int | None]] = [(a, 80), (b, 80), (c, 80)]
    positions = assign_positions(rows)
    assert positions == {a: 1, b: 1, c: 1}


# ─── compute_aggregate ──────────────────────────────────────────────────────


def test_aggregate_sums_grade_numbers() -> None:
    """BECE style — sum of grade values. Grades 1,2,3 → aggregate 6."""
    assert compute_aggregate(["1", "2", "3"]) == 6


def test_aggregate_ignores_none() -> None:
    """None entries (missing/pending scores) are dropped from the sum."""
    assert compute_aggregate(["4", None, "5"]) == 9


def test_aggregate_returns_none_when_all_missing() -> None:
    """Empty list or all-None → None (FE renders as "—")."""
    assert compute_aggregate([]) is None
    assert compute_aggregate([None, None]) is None


def test_aggregate_single_grade() -> None:
    assert compute_aggregate(["7"]) == 7


def test_aggregate_caps_at_best_6_when_more_subjects_are_graded() -> None:
    """A student graded in 9 subjects isn't penalised for the worst 3 —
    real BECE only ever counts the best 6. Regression test for a bug
    where the naive "sum every subject" version inflated a genuine
    student's aggregate from 43 to 69."""
    grades: list[str | None] = ["7", "7", "8", "8", "9", "7", "9", "7", "7"]
    assert compute_aggregate(grades) == 43


def test_aggregate_sums_all_when_fewer_than_6_graded() -> None:
    """Can't take the best 6 of fewer than 6 — sum whatever's there."""
    assert compute_aggregate(["3", "5", None]) == 8
