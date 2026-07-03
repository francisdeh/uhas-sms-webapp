"""Assemble the sidebar badge counts for the calling user.

Every non-approver role short-circuits to a zero-filled `NavBadges` so
the DB never sees a query the badge can't possibly be non-zero for.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError
from app.core.roles import DEPUTY_HEAD, TEACHER
from app.core.security import CurrentUser
from app.features.shell.repository import NavBadgesRepository
from app.features.shell.schema import NavBadges
from app.features.staff.model import Staff


class NavBadgesService:
    """Resolve the caller's sidebar badge counts."""

    @staticmethod
    async def get(session: AsyncSession, user: CurrentUser) -> NavBadges:
        """Return the badge map for the current JWT holder.

        Branches:
          - Teacher + is_unit_head=True → count submitted plans in their
            `unit_head_of` division.
          - Deputy Head → count unit-head-approved plans in their staff
            row's division.
          - Everyone else → zeroed defaults; no DB read.

        Raises `ForbiddenError` if the JWT lacks a school_id — the badge
        counts are always school-scoped, and a session without one is
        malformed regardless of role.
        """
        if not user.school_id:
            raise ForbiddenError("Session is missing school scope.")

        if user.role not in (TEACHER, DEPUTY_HEAD) or not user.linked_id:
            return NavBadges()

        staff = await session.scalar(select(Staff).where(Staff.id == UUID(user.linked_id)))
        if staff is None:
            return NavBadges()

        if user.role == TEACHER:
            if not bool(staff.is_unit_head) or not staff.unit_head_of:
                return NavBadges()
            count = await NavBadgesRepository.count_lesson_plans_pending_for_unit_head(
                session,
                school_id=user.school_id,
                division=staff.unit_head_of,
            )
            return NavBadges(lesson_plans_pending_review=count)

        if not staff.division:
            return NavBadges()
        count = await NavBadgesRepository.count_lesson_plans_pending_for_deputy_head(
            session,
            school_id=user.school_id,
            division=staff.division,
        )
        return NavBadges(lesson_plans_pending_review=count)
