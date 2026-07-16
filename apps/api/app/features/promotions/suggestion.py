"""Algorithmic promote/repeat/graduate suggestion.

Backend-only — the frontend has no copy of this logic and only ever
displays `suggestedDecision`/`suggestedReason` from the API response.
Kept as a pure function of shaped inputs — the DB fetches happen in
the service, this module only computes.

Rule set (per school policy):
  * If Term-3 EndOfTerm exam isn't published → no suggestion (`None`).
    The season was opened with `override` and the teacher must decide
    every row manually.
  * `JHS 3` → `graduate` unconditionally.
  * Otherwise: count core subjects where `total_score < fail_threshold`
    (the school's configured `schools.pass_mark`, defaulting to 40). If
    ≥ 3 → `repeat` with the failed-subject list. Otherwise → `promote`.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from app.features.promotions.constants import DEC_GRADUATE, DEC_PROMOTE, DEC_REPEAT
from app.features.promotions.next_class import JHS_3

_FAIL_COUNT_REPEAT = 3


@dataclass(frozen=True)
class CoreSubject:
    id: UUID | str
    name: str


@dataclass(frozen=True)
class ScoreForSuggestion:
    subject_id: UUID | str
    total_score: int | None


@dataclass(frozen=True)
class Suggestion:
    suggested_decision: str  # "promote" | "repeat" | "graduate"
    suggested_reason: str
    failed_core_subjects: int


def compute_suggestion(
    *,
    class_name: str,
    division_core_subjects: list[CoreSubject],
    scores_for_student: list[ScoreForSuggestion],
    exam_published: bool,
    fail_threshold: int,
) -> Suggestion | None:
    """See module docstring for the rule set."""
    if not exam_published:
        return None

    if class_name == JHS_3:
        return Suggestion(
            suggested_decision=DEC_GRADUATE,
            suggested_reason=f"Completed {JHS_3}",
            failed_core_subjects=0,
        )

    # Look up each core subject's score. Only count a subject as failed
    # when the score is present AND below threshold — a missing score is
    # ambiguous (probably not entered yet) and shouldn't push the
    # student toward repeat.
    score_by_subject: dict[str, ScoreForSuggestion] = {
        str(s.subject_id): s for s in scores_for_student
    }
    failed_subjects = [
        sub
        for sub in division_core_subjects
        if (score := score_by_subject.get(str(sub.id))) is not None
        and score.total_score is not None
        and score.total_score < fail_threshold
    ]

    if len(failed_subjects) >= _FAIL_COUNT_REPEAT:
        subject_list = ", ".join(s.name for s in failed_subjects)
        return Suggestion(
            suggested_decision=DEC_REPEAT,
            suggested_reason=f"Failed {len(failed_subjects)} core subjects: {subject_list}",
            failed_core_subjects=len(failed_subjects),
        )

    return Suggestion(
        suggested_decision=DEC_PROMOTE,
        suggested_reason="",
        failed_core_subjects=len(failed_subjects),
    )
