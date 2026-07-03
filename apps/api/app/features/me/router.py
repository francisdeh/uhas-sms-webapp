"""HTTP route for the session-user endpoint.

    GET /me   →  MeRead (any authenticated user)

Called on every dashboard render by the Next-side `getSessionUser()`
helper — this endpoint replaces the Drizzle join across users/staff/
guardians and lets the web app stay Drizzle-free.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentUserDep
from app.features.me.schema import MeRead
from app.features.me.service import MeService

router = APIRouter(prefix="/me", tags=["me"])


@router.get(
    "",
    response_model=MeRead,
    response_model_by_alias=True,
    summary="Fetch the caller's composite session profile",
)
async def get_me(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> MeRead:
    """Return the current session's rich SessionUser shape.

    The web layer calls this on every dashboard render — one round-trip
    instead of three (`users` + `staff|guardians` + JWT decode). Fields
    match the legacy `SessionUser` TS type 1:1 so the display doesn't
    shift when the migration cuts over.
    """
    return await MeService.get(session, user)
