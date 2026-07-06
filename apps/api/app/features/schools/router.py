"""HTTP routes for the Schools/Settings domain.

Three endpoints:

  GET   /school          → current user's school (read, any authenticated role)
  PATCH /school          → partial update (admin only)
  GET   /school/public    → cosmetic-only read, no auth (login-page branding)

The first two read the school_id from the JWT (`CurrentSchoolIdDep`) so
there's no opportunity for path-tampering to read another school's
data. The PATCH is gated on the `Admin` role via `require_role`;
non-admins get a 403 distinct from the 401 they'd get for an invalid
token. `/school/public` is the deliberate exception — see its own
docstring for why.

The OpenAPI schema this generates is consumed by `apps/web` via
`scripts/check-api-types-drift.sh` — keep `response_model=` accurate.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.features.schools.schema import (
    GradingDefaultsRead,
    SchoolPublicRead,
    SchoolRead,
    SchoolUpdate,
)
from app.features.schools.service import SchoolsService

router = APIRouter(prefix="/school", tags=["school"])


@router.get(
    "/public",
    response_model=SchoolPublicRead,
    response_model_by_alias=True,
    summary="Fetch cosmetic school info for the login page — no auth required",
)
async def get_school_public(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SchoolPublicRead:
    """Return name/motto/logo only — the login page renders this before
    any session exists, so there's no JWT to resolve a school_id from.

    Deliberately excludes everything else on the `schools` row (address,
    phone, grading config, security policy, …) — this is the one route
    in the entire API that skips auth, so the response shape stays
    permanently minimal regardless of what gets added to `SchoolRead`.
    """
    row = await SchoolsService.get_public(session)
    return SchoolPublicRead.model_validate(row)


@router.get(
    "/grading-defaults",
    response_model=GradingDefaultsRead,
    response_model_by_alias=True,
    summary="Fetch the fixed GES-standard grading defaults",
)
async def get_grading_defaults(
    user: CurrentUserDep,
    response: Response,
) -> GradingDefaultsRead:
    """Return the national GES-standard grading bands / weights / pass
    mark — a process-level constant, not this school's saved config.

    Backs the Settings > Grading "Reset to GES standard" control. Any
    authenticated user may read it; the payload is identical for
    everyone and non-sensitive, so it's cacheable — it only changes when
    the constant ships in a new deploy.
    """
    response.headers["Cache-Control"] = "public, max-age=3600"
    return SchoolsService.grading_defaults()


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

    Grading bands/score weights are resolved to the GES defaults when a
    school hasn't customized either (see `SchoolsService.get_resolved`)
    — every consumer of a live reading gets one real value from the
    backend instead of guessing at its own copy.
    """
    return await SchoolsService.get_resolved(session, school_id)


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
    and the field-level before/after (`SCHOOL_SETTINGS_UPDATE` action).
    """
    # `user.user_id` is the Supabase Auth UUID (from `sub`) — that's what
    # we record in the audit row.
    updated = await SchoolsService.patch(session, school_id, payload, actor_user_id=user.user_id)
    return SchoolRead.model_validate(updated)
