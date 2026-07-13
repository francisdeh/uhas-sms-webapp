"""Data-access layer for the Lesson Plans domain.

Read paths join a `latest_review` subquery so callers get the joined
reviewer + comment + timestamp in one round trip without changing the
external shape of `LessonPlanRead`.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Subquery, and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.features.classes.model import Class
from app.features.lesson_plans.model import LessonPlan, LessonPlanReview
from app.features.staff.model import Staff
from app.features.subjects.model import Subject


def _latest_review_subq() -> Subquery:
    """One row per lesson_plan, holding the most recent review's fields.

    `DISTINCT ON (lesson_plan_id) ... ORDER BY lesson_plan_id, created_at DESC`
    is Postgres' idiom for "latest per group" — cheaper than a window
    function for a two-column ranking.
    """
    return (
        select(
            LessonPlanReview.lesson_plan_id.label("lesson_plan_id"),
            LessonPlanReview.reviewer_id.label("reviewer_id"),
            LessonPlanReview.comment.label("comment"),
            LessonPlanReview.created_at.label("created_at"),
        )
        .distinct(LessonPlanReview.lesson_plan_id)
        .order_by(
            LessonPlanReview.lesson_plan_id,
            desc(LessonPlanReview.created_at),
        )
        .subquery()
    )


class LessonPlansRepository:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        division: str | None = None,
        class_id: UUID | str | None = None,
        term: int | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[
        list[
            tuple[
                LessonPlan,
                Staff,
                Subject,
                Class,
                Staff | None,  # latest reviewer
                str | None,  # latest reviewer_comment
                object | None,  # latest reviewed_at (datetime)
            ]
        ],
        int,
    ]:
        """List with joined teacher + subject + class + latest reviewer.

        Soft-deleted rows excluded.
        """
        reviewer = aliased(Staff, name="reviewer")
        teacher = aliased(Staff, name="teacher")
        latest = _latest_review_subq()

        where = [
            LessonPlan.school_id == school_id,
            LessonPlan.deleted_at.is_(None),
        ]
        if teacher_id:
            where.append(LessonPlan.teacher_id == teacher_id)
        if status:
            where.append(LessonPlan.status == status)
        if class_id:
            where.append(LessonPlan.class_id == class_id)
        if term is not None:
            where.append(LessonPlan.term == term)
        if division:
            where.append(Class.division == division)

        where_clause = and_(*where)

        count_stmt = (
            select(func.count(LessonPlan.id))
            .join(Class, Class.id == LessonPlan.class_id)
            .where(where_clause)
        )
        total = int((await session.execute(count_stmt)).scalar_one() or 0)

        offset = (page - 1) * size
        rows_stmt = (
            select(
                LessonPlan,
                teacher,
                Subject,
                Class,
                reviewer,
                latest.c.comment,
                latest.c.created_at,
            )
            .join(teacher, teacher.id == LessonPlan.teacher_id)
            .join(Subject, Subject.id == LessonPlan.subject_id)
            .join(Class, Class.id == LessonPlan.class_id)
            .outerjoin(latest, latest.c.lesson_plan_id == LessonPlan.id)
            .outerjoin(reviewer, reviewer.id == latest.c.reviewer_id)
            .where(where_clause)
            .order_by(desc(LessonPlan.updated_at))
            .offset(offset)
            .limit(size)
        )
        rows = [
            (lp, tch, sub, cls, rev, comment, ts)
            for lp, tch, sub, cls, rev, comment, ts in (await session.execute(rows_stmt)).all()
        ]
        return rows, total

    @staticmethod
    async def get_by_id(
        session: AsyncSession, school_id: UUID | str, plan_id: UUID | str
    ) -> (
        tuple[
            LessonPlan,
            Staff,
            Subject,
            Class,
            Staff | None,
            str | None,
            object | None,
        ]
        | None
    ):
        reviewer = aliased(Staff, name="reviewer")
        teacher = aliased(Staff, name="teacher")
        latest = _latest_review_subq()
        stmt = (
            select(
                LessonPlan,
                teacher,
                Subject,
                Class,
                reviewer,
                latest.c.comment,
                latest.c.created_at,
            )
            .join(teacher, teacher.id == LessonPlan.teacher_id)
            .join(Subject, Subject.id == LessonPlan.subject_id)
            .join(Class, Class.id == LessonPlan.class_id)
            .outerjoin(latest, latest.c.lesson_plan_id == LessonPlan.id)
            .outerjoin(reviewer, reviewer.id == latest.c.reviewer_id)
            .where(
                and_(
                    LessonPlan.id == plan_id,
                    LessonPlan.school_id == school_id,
                    LessonPlan.deleted_at.is_(None),
                )
            )
        )
        row = (await session.execute(stmt)).first()
        if not row:
            return None
        lp, tch, sub, cls, rev, comment, ts = row
        return (lp, tch, sub, cls, rev, comment, ts)

    @staticmethod
    async def insert_review(
        session: AsyncSession,
        *,
        lesson_plan_id: UUID | str,
        reviewer_id: UUID | str,
        decision: str,
        comment: str | None,
    ) -> LessonPlanReview:
        """Append a new review event. Never overwrites — this is the
        whole reason we split reviews into their own table."""
        row = LessonPlanReview(
            lesson_plan_id=lesson_plan_id,
            reviewer_id=reviewer_id,
            decision=decision,
            comment=comment,
        )
        session.add(row)
        await session.flush()
        return row
