"""Data-access layer for the nav-badges endpoint.

Aggregate-only: every method returns a scalar count. Kept out of
`LessonPlansRepository` because the badge queries have a different
purpose (dashboard summary) and shouldn't grow paging/joining logic
that only a listing view cares about.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.lesson_plans.constants import SUBMITTED, UNIT_HEAD_APPROVED
from app.features.lesson_plans.model import LessonPlan


class NavBadgesRepository:
    @staticmethod
    async def count_lesson_plans_pending_for_unit_head(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        division: str,
    ) -> int:
        """Submitted plans in the Unit Head's division — awaiting their sign-off."""
        stmt = (
            select(func.count(LessonPlan.id))
            .join(Class, Class.id == LessonPlan.class_id)
            .where(
                LessonPlan.school_id == school_id,
                LessonPlan.deleted_at.is_(None),
                LessonPlan.status == SUBMITTED,
                Class.division == division,
            )
        )
        return int((await session.execute(stmt)).scalar_one() or 0)

    @staticmethod
    async def count_lesson_plans_pending_for_deputy_head(
        session: AsyncSession,
        *,
        school_id: UUID | str,
        division: str,
    ) -> int:
        """Unit-Head-signed plans in the Deputy's division — awaiting deputy approval."""
        stmt = (
            select(func.count(LessonPlan.id))
            .join(Class, Class.id == LessonPlan.class_id)
            .where(
                LessonPlan.school_id == school_id,
                LessonPlan.deleted_at.is_(None),
                LessonPlan.status == UNIT_HEAD_APPROVED,
                Class.division == division,
            )
        )
        return int((await session.execute(stmt)).scalar_one() or 0)
