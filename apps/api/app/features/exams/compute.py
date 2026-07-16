"""Pure functions that compute total scores, grades, and positions.

Isolated from I/O so we can unit-test the maths without a database.
Weights and grade bands come in as arguments — the service resolves
them from `school.score_weights` / `school.grading_bands` (with fallback
to the defaults in `constants.py`) before calling in.

Ported from `apps/web/src/features/exams/utils.ts`; behaviour is
identical (verified by parallel tests) — the goal is bit-for-bit
compatibility so no report cards shift when the migration cuts over.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.features.exams.constants import (
    DEFAULT_GRADE_BANDS,
    DEFAULT_SCORE_WEIGHTS,
    ExamType,
)


@dataclass(frozen=True, slots=True)
class ComponentScores:
    """The inputs to the weighted total. Any component can be `None`
    ("not entered") — the weighted-sum treats missing as zero, matching
    the legacy behaviour."""

    cat1: int | None = None
    cat2: int | None = None
    project_work: int | None = None
    group_work: int | None = None
    exam_score: int | None = None

    def any_present(self) -> bool:
        """True if at least one component has a value — used to decide
        whether to write a NULL row vs a scored row."""
        return any(
            v is not None
            for v in (self.cat1, self.cat2, self.project_work, self.group_work, self.exam_score)
        )


def compute_total(
    exam_type: ExamType,
    components: ComponentScores,
    *,
    weights: dict[str, Any] | None = None,
) -> int | None:
    """Return the (rounded) total for this row, or `None` if empty.

    Rules (mirroring the TS side):
      - MidTerm ranks on the raw exam score at 100%; components are
        ignored. If `exam_score` is None, the row has no total.
      - EndOfTerm applies the school's configured weights. Missing
        components contribute 0 to the weighted sum (they're not
        "excused"; the school's policy is "unentered = 0 in the total,
        blank on the report card").

    Weights arrive as a dict shaped like `DEFAULT_SCORE_WEIGHTS` — the
    keys are camelCase (`cat1`, `groupWork`, `projectWork`, `exam`) so
    the JSONB blob written by Settings can be handed straight through.
    """
    if exam_type == "MidTerm":
        return components.exam_score

    if not components.any_present():
        return None

    w = weights or DEFAULT_SCORE_WEIGHTS
    # `/100` — the weights sum to 100 by settings-validator invariant.
    weighted = (
        (components.cat1 or 0) * int(w.get("cat1", 0))
        + (components.cat2 or 0) * int(w.get("cat2", 0))
        + (components.group_work or 0) * int(w.get("groupWork", 0))
        + (components.project_work or 0) * int(w.get("projectWork", 0))
        + (components.exam_score or 0) * int(w.get("exam", 0))
    ) / 100.0
    return round(weighted)


def compute_grade(
    total: int,
    *,
    bands: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    """Map a total score to `(grade, interpretation)`.

    Bands come in as a list of `{min, max, grade, interpretation}`; the
    first band whose `[min, max]` covers `total` wins. If nothing matches
    (a total below the lowest band's floor, e.g. negative), the last band
    is returned — a report card is never left ungraded.
    """
    resolved = bands or DEFAULT_GRADE_BANDS
    for band in resolved:
        if int(band["min"]) <= total <= int(band["max"]):
            return str(band["grade"]), str(band["interpretation"])
    last = resolved[-1]
    return str(last["grade"]), str(last["interpretation"])


def assign_positions(rows: list[tuple[Any, int | None]]) -> dict[Any, int | None]:
    """Given `[(id, total), …]`, return `{id: position}`.

    Standard-competition ranking (1224 style): equal totals share the
    lower rank, the next distinct total skips the shared count. Rows
    with `None` total get position `None` — they're excluded from the
    ranking entirely (unscored students don't push anyone down).

    Called once per (exam, subject, class) group after a batch upsert.
    """
    ranked = sorted(
        [(rid, total) for rid, total in rows if total is not None],
        key=lambda x: x[1],
        reverse=True,
    )

    out: dict[Any, int | None] = {rid: None for rid, _ in rows}
    position = 0
    last_total: int | None = None
    tied_count = 0
    for rid, total in ranked:
        tied_count += 1
        if total != last_total:
            position += tied_count
            tied_count = 0
            last_total = total
        out[rid] = position
    return out


_AGGREGATE_BEST_N = 6


def compute_aggregate(grades: list[str | None]) -> int | None:
    """BECE-style aggregate: sum of the student's best 6 grades. Lower
    is better. A student who scores well in more than 6 subjects isn't
    penalised for the rest — this mirrors the real BECE aggregate,
    which only ever counts a candidate's 6 best results (in practice
    the 4 core subjects plus their best 2 electives; this simplified
    version doesn't distinguish core from elective, since that flag
    isn't tracked per subject yet — see `ReportCardScoreRow`'s
    docstring in report_card_svc.py).

    `grades` is a list of grade strings (`"1"` through `"9"`); `None`
    entries (missing/pending scores) are skipped. Returns `None` when
    no graded rows exist — the caller renders that as "—" rather than
    a misleading `0`.

    Mirrors `apps/web/src/features/exams/utils.ts::computeAggregate`.
    """
    graded = sorted(int(g) for g in grades if g is not None)
    if not graded:
        return None
    return sum(graded[:_AGGREGATE_BEST_N])
