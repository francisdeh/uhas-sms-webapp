"""HTTP routes for the Schools/Settings domain.

Two endpoints — every settings tab in the Admin UI uses these:

  GET   /school          → current user's school (read)
  PATCH /school          → partial update (admin only)

Both read the school_id from the JWT (`CurrentSchoolIdDep`) so there's
no opportunity for path-tampering to read another school's data. The
PATCH is gated on the `Admin` role via `require_role`; non-admins get a
403 distinct from the 401 they'd get for an invalid token.

The OpenAPI schema this generates is consumed by `apps/web` via
`scripts/check-api-types-drift.sh` — keep `response_model=` accurate.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.schools.schema import SchoolRead, SchoolUpdate
from app.features.schools.service import SchoolsService

router = APIRouter(prefix="/school", tags=["school"])


@router.get(
    "",
    response_model=SchoolRead,
    response_model_by_alias=True,
    summary="Fetch the current school's settings",
)
async def get_school(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SchoolRead:
    """Return the full settings row for the caller's school.

    Any authenticated user with a valid school_id claim can read this —
    the settings drive UI everywhere (logo on every page, term on the
    dashboard, brand colours), not just the Admin Settings page.
    """
    row = await SchoolsService.get(session, school_id)
    return SchoolRead.model_validate(row)


@router.patch(
    "",
    response_model=SchoolRead,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Update school settings (Admin only)",
)
async def patch_school(
    payload: SchoolUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> SchoolRead:
    """Apply a partial update; writes an audit_log row with the diff.

    Only `Admin` can modify settings. The audit row records who, when,
    and the field-level before/after — same shape as the legacy
    `SCHOOL_SETTINGS_UPDATE` rows produced by the Next-side Server
    Action, so historical entries remain queryable.
    """
    # `user.user_id` is the Supabase Auth UUID (from `sub`) — that's what
    # we record in the audit row.
    updated = await SchoolsService.patch(session, school_id, payload, actor_user_id=user.user_id)
    return SchoolRead.model_validate(updated)
