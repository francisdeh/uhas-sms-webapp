"""Closed sets + default grading config for the Exams domain.

Grade bands + score weights are configurable per school via
`schools.grading_bands` and `schools.score_weights`. When a school
hasn't set either (fresh install, null column), the defaults here
apply — they mirror the Ghana Education Service standard, which is
what UHAS Basic currently uses.

Bands come from the school report-card template; interpretations are
their exact wording. Weights come from the school's academic policy.
"""

from __future__ import annotations

from typing import Any, Final, Literal

MID_TERM: Final = "MidTerm"
END_OF_TERM: Final = "EndOfTerm"

ExamType = Literal["MidTerm", "EndOfTerm"]


# ── Class-report workflow ─────────────────────────────────────────────────────
# Report lifecycle: `draft` (edited by class teacher) → `submitted`
# (locked; Deputy/Admin can amend HOS comment). The column is
# `varchar(20)` with a runtime `default('draft')` in the baseline; both
# lowercase values are baked into the DB — do not capitalise here.
CLASS_REPORT_DRAFT: Final = "draft"
CLASS_REPORT_SUBMITTED: Final = "submitted"

ClassReportStatus = Literal["draft", "submitted"]

# ── Score-entry completeness ──────────────────────────────────────────────────
# Per (class, subject, exam): how much of the roster has a graded score.
NOT_STARTED: Final = "not_started"  # 0 graded
PARTIAL: Final = "partial"  # some, not all
COMPLETE: Final = "complete"  # every active student graded

ScoreEntryStatus = Literal["not_started", "partial", "complete"]


# ── Grade bands ───────────────────────────────────────────────────────────────
# Ordered highest → lowest. `min` and `max` are inclusive; ranges cover
# 0-100 without gaps. `grade` is the numeric grade string (1..9); the
# `interpretation` is the human-readable label report cards print.
DEFAULT_GRADE_BANDS: Final[list[dict[str, Any]]] = [
    {"min": 90, "max": 100, "grade": "1", "interpretation": "Highest"},
    {"min": 80, "max": 89, "grade": "2", "interpretation": "Higher"},
    {"min": 70, "max": 79, "grade": "3", "interpretation": "High"},
    {"min": 60, "max": 69, "grade": "4", "interpretation": "High Average"},
    {"min": 55, "max": 59, "grade": "5", "interpretation": "Average"},
    {"min": 50, "max": 54, "grade": "6", "interpretation": "Lower Average"},
    {"min": 40, "max": 49, "grade": "7", "interpretation": "Low"},
    {"min": 35, "max": 39, "grade": "8", "interpretation": "Lower"},
    {"min": 0, "max": 34, "grade": "9", "interpretation": "Lowest"},
]


# ── Pass mark ─────────────────────────────────────────────────────────────────
# Fallback when `schools.pass_mark` is unset. Consumed by the promotion
# auto-suggest (a core subject scoring below this counts as failed).
DEFAULT_PASS_MARK: Final = 40


# ── Score weights ─────────────────────────────────────────────────────────────
# Applies only to EndOfTerm. MidTerm ignores components and uses the
# raw exam score at 100% (see compute._compute_total).
DEFAULT_SCORE_WEIGHTS: Final[dict[str, int]] = {
    "cat1": 10,
    "cat2": 10,
    "groupWork": 10,
    "projectWork": 10,
    "exam": 60,
}
