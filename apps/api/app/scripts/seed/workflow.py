"""Workflow group — lesson plans (+ reviews), schemes, assignments,
and end-of-term class-report submissions.

One lesson plan / scheme / assignment per class, cycling through every
status value so each stage of every pipeline has at least one example
to click through. Only JHS classes route through a Unit Head review
first — that stage doesn't exist in the other divisions.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.features.assignments.model import Assignment
from app.features.exams.model import ClassReportSubmission, StudentReportRemark
from app.features.lesson_plans.model import LessonPlan, LessonPlanReview
from app.features.schemes.model import Scheme
from app.scripts.seed.academic import AcademicResult, ClassRoster
from app.scripts.seed.assessment import AssessmentResult
from app.scripts.seed.identity import ACADEMIC_YEAR, IdentityResult

CURRENT_TERM = 2

_DEPUTY_SLUG_BY_DIVISION = {
    "KG": "STAFF-007",
    "Lower Primary": "STAFF-003",
    "Upper Primary": "STAFF-016",
    "JHS": "STAFF-002",
}
_UNIT_HEAD_SLUG_BY_DIVISION = {"JHS": "STAFF-004"}

_LESSON_PLAN_STATUS_CYCLE = ("draft", "submitted", "unit_head_approved", "approved", "rejected")
_SCHEME_STATUS_CYCLE = ("draft", "submitted", "acknowledged")
_ASSIGNMENT_STATUS_CYCLE = ("draft", "published")


def _first_subject(roster: ClassRoster) -> tuple[str, UUID]:
    name, subject_id = next(iter(roster.subject_ids.items()))
    return name, subject_id


async def seed_workflow(
    session: AsyncSession,
    identity: IdentityResult,
    academic: AcademicResult,
    assessment: AssessmentResult,
) -> None:
    rosters = list(academic.rosters.values())

    # No relationship() exists anywhere in this codebase, so the ORM can't
    # infer cross-table insert ordering — lesson plans must be flushed
    # before reviews that FK to them.
    plans: list[tuple[LessonPlan, ClassRoster, str, UUID]] = []
    for i, roster in enumerate(rosters):
        _, subject_id = _first_subject(roster)
        teacher_id = roster.teacher_staff_id
        status = _LESSON_PLAN_STATUS_CYCLE[i % len(_LESSON_PLAN_STATUS_CYCLE)]
        # Non-JHS divisions have no Unit Head stage — collapse straight to submitted/approved.
        if status == "unit_head_approved" and roster.division != "JHS":
            status = "submitted"

        plan = LessonPlan(
            id=uuid4(),
            school_id=academic.school_id,
            teacher_id=teacher_id,
            subject_id=subject_id,
            class_id=roster.class_id,
            term=CURRENT_TERM,
            week=(i % 12) + 1,
            topic=f"Week {(i % 12) + 1} topic for {roster.slug}",
            learning_objectives="Students will be able to explain and apply the week's core "
            "concept.",
            teaching_methods="Direct instruction, group work, guided practice.",
            resources="Textbook, whiteboard, worksheets.",
            assessment_plan="Exit-ticket quiz + classwork review.",
            status=status,
        )
        plans.append((plan, roster, status, subject_id))
        session.add(plan)
    await session.flush()

    for i, (plan, roster, status, subject_id) in enumerate(plans):
        teacher_id = roster.teacher_staff_id
        deputy_id = identity.staff_ids[_DEPUTY_SLUG_BY_DIVISION[roster.division]]
        if status == "unit_head_approved" and roster.division in _UNIT_HEAD_SLUG_BY_DIVISION:
            unit_head_id = identity.staff_ids[_UNIT_HEAD_SLUG_BY_DIVISION[roster.division]]
            session.add(
                LessonPlanReview(
                    id=uuid4(),
                    lesson_plan_id=plan.id,
                    reviewer_id=unit_head_id,
                    decision="unit_head_approved",
                    comment="Good structure — proceed to Deputy Head.",
                )
            )
        elif status == "approved":
            session.add(
                LessonPlanReview(
                    id=uuid4(),
                    lesson_plan_id=plan.id,
                    reviewer_id=deputy_id,
                    decision="approved",
                    comment="Approved.",
                )
            )
        elif status == "rejected":
            session.add(
                LessonPlanReview(
                    id=uuid4(),
                    lesson_plan_id=plan.id,
                    reviewer_id=deputy_id,
                    decision="rejected",
                    comment="Please add differentiated activities for weaker learners.",
                )
            )

        scheme_status = _SCHEME_STATUS_CYCLE[i % len(_SCHEME_STATUS_CYCLE)]
        session.add(
            Scheme(
                id=uuid4(),
                school_id=academic.school_id,
                teacher_id=teacher_id,
                subject_id=subject_id,
                class_id=roster.class_id,
                type="work",
                term=CURRENT_TERM,
                academic_year=ACADEMIC_YEAR,
                title=f"Term {CURRENT_TERM} scheme of work — {roster.slug}",
                content="Week-by-week topic breakdown for the term.",
                status=scheme_status,
                reviewed_by_id=deputy_id if scheme_status == "acknowledged" else None,
                reviewer_comment="Acknowledged — thorough coverage."
                if scheme_status == "acknowledged"
                else None,
                reviewed_at=datetime(2026, 1, 15) if scheme_status == "acknowledged" else None,
                submitted_at=datetime(2026, 1, 10) if scheme_status != "draft" else None,
            )
        )

        assignment_status = _ASSIGNMENT_STATUS_CYCLE[i % len(_ASSIGNMENT_STATUS_CYCLE)]
        session.add(
            Assignment(
                id=uuid4(),
                school_id=academic.school_id,
                teacher_id=teacher_id,
                subject_id=subject_id,
                class_id=roster.class_id,
                title=f"Homework — {roster.slug}",
                description="Complete the exercises assigned in class.",
                due_date=date(2026, 1, 30) + timedelta(days=i),
                status=assignment_status,
                published_at=datetime(2026, 1, 20) if assignment_status == "published" else None,
            )
        )

        submission = ClassReportSubmission(
            id=uuid4(),
            exam_id=assessment.end_of_term_exam_id,
            class_id=roster.class_id,
            status="submitted",
            submitted_by_id=teacher_id,
            submitted_at=datetime(2026, 4, 1),
            head_of_school_comment="Well done this term.",
        )
        session.add(submission)
        for student_id in roster.student_ids:
            session.add(
                StudentReportRemark(
                    id=uuid4(),
                    exam_id=assessment.end_of_term_exam_id,
                    student_id=student_id,
                    class_teacher_remark="Good progress this term — keep it up.",
                )
            )

    await session.flush()
