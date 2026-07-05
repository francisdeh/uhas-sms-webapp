"""Assessment group — one MidTerm and one published EndOfTerm exam for
the current term, with scores (+ computed grade/total/position) across
every class's full roster.

Bypassing the service layer means nothing computes `total_score`/
`grade`/`interpretation`/`subject_position` for us — `exams/compute.py`'s
pure functions are reused directly so seeded report cards match what
the real scoring flow would have produced.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.exams.compute import (
    ComponentScores,
    assign_positions,
    compute_grade,
    compute_total,
)
from app.features.exams.constants import (
    DEFAULT_GRADE_BANDS,
    DEFAULT_SCORE_WEIGHTS,
    END_OF_TERM,
    MID_TERM,
)
from app.features.exams.model import Exam, Score
from app.scripts.seed.academic import AcademicResult
from app.scripts.seed.identity import ACADEMIC_YEAR

_RNG_SEED = 20260703  # fixed seed — same "random" scores every run, per the reset-only design
CURRENT_TERM = 2


def _component_scores(rng: random.Random) -> ComponentScores:
    return ComponentScores(
        cat1=rng.randint(5, 10),
        cat2=rng.randint(5, 10),
        group_work=rng.randint(6, 10),
        project_work=rng.randint(6, 10),
        exam_score=rng.randint(35, 95),
    )


@dataclass
class AssessmentResult:
    mid_term_exam_id: UUID
    end_of_term_exam_id: UUID


async def seed_assessment(session: AsyncSession, academic: AcademicResult) -> AssessmentResult:
    school_id = academic.school_id
    rng = random.Random(_RNG_SEED)

    mid_term = Exam(
        id=uuid4(),
        school_id=school_id,
        name=f"Mid-Term {CURRENT_TERM} {ACADEMIC_YEAR}",
        type=MID_TERM,
        term=CURRENT_TERM,
        academic_year=ACADEMIC_YEAR,
        is_published=True,
    )
    end_of_term = Exam(
        id=uuid4(),
        school_id=school_id,
        name=f"End of Term {CURRENT_TERM} {ACADEMIC_YEAR}",
        type=END_OF_TERM,
        term=CURRENT_TERM,
        academic_year=ACADEMIC_YEAR,
        is_published=True,
    )
    session.add_all([mid_term, end_of_term])
    # No relationship() exists anywhere in this codebase, so the ORM can't
    # infer cross-table insert ordering — flush exams before scores FK to them.
    await session.flush()

    for exam in (mid_term, end_of_term):
        for roster in academic.rosters.values():
            for subject_id in roster.subject_ids.values():
                rows: list[Score] = []
                for student_id in roster.student_ids:
                    comps = _component_scores(rng)
                    total = compute_total(exam.type, comps, weights=DEFAULT_SCORE_WEIGHTS)  # type: ignore[arg-type]
                    grade, interpretation = (
                        compute_grade(total, bands=DEFAULT_GRADE_BANDS)
                        if total is not None
                        else (None, None)
                    )
                    rows.append(
                        Score(
                            id=uuid4(),
                            exam_id=exam.id,
                            student_id=student_id,
                            subject_id=subject_id,
                            cat1=comps.cat1,
                            cat2=comps.cat2,
                            group_work=comps.group_work,
                            project_work=comps.project_work,
                            exam_score=comps.exam_score,
                            total_score=total,
                            grade=grade,
                            interpretation=interpretation,
                        )
                    )
                positions = assign_positions([(row.id, row.total_score) for row in rows])
                for row in rows:
                    row.subject_position = positions[row.id]
                session.add_all(rows)

    await session.flush()
    return AssessmentResult(mid_term_exam_id=mid_term.id, end_of_term_exam_id=end_of_term.id)
