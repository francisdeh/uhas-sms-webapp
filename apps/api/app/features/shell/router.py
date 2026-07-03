"""HTTP route for sidebar badge counts.

    GET /shell/nav-badges   →  NavBadges (any authenticated user)

The Next-side sidebar calls this once per render to decorate menu
entries with pending-count pips. Response is always the full
`NavBadges` shape — a new field defaults to zero so clients on older
builds keep rendering when it ships.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentUserDep
from app.features.shell.schema import NavBadges
from app.features.shell.service import NavBadgesService

router = APIRouter(prefix="/shell", tags=["shell"])


@router.get(
    "/nav-badges",
    response_model=NavBadges,
    response_model_by_alias=True,
    summary="Sidebar badge counts for the caller",
)
async def get_nav_badges(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> NavBadges:
    """Return the caller's badge counts.

    Only Unit Heads and Deputy Heads accumulate a non-zero
    `lessonPlansPendingReview`. Every other role sees zeroes without
    the DB being queried.
    """
    return await NavBadgesService.get(session, user)
