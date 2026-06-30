"""HTTP routes for the SchoolTerms sub-resource.

Mounted under the school router's URL space:

  GET /school/terms       → list all terms for the caller's school (every
                            academic year), sorted (year asc, term asc).
                            Any authenticated role with a school_id claim.
  PUT /school/terms       → upsert the three terms for one academic year.
                            Admin only. Writes one audit_log row.

The school_id is read from the JWT (`CurrentSchoolIdDep`); no path
parameter, so cross-school access on this surface is structurally
impossible.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.school_terms.schema import (
    TermRead,
    TermsListResponse,
    TermsUpsertRequest,
)
from app.features.school_terms.service import SchoolTermsService

router = APIRouter(prefix="/school/terms", tags=["school-terms"])


@router.get(
    "",
    response_model=TermsListResponse,
    response_model_by_alias=True,
    summary="List all terms for the current school",
)
async def list_terms(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TermsListResponse:
    """Return every configured term row, sorted (academic_year, term)."""
    rows = await SchoolTermsService.list_for_school(session, school_id)
    return TermsListResponse(items=[TermRead.model_validate(r) for r in rows])


@router.put(
    "",
    response_model=TermsListResponse,
    response_model_by_alias=True,
    status_code=status.HTTP_200_OK,
    summary="Upsert the three terms for one academic year (Admin only)",
)
async def upsert_terms(
    payload: TermsUpsertRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> TermsListResponse:
    """Replace all three terms for the given academic_year in one call.

    Schema-level validators already enforced "exactly 3 distinct terms
    numbered 1/2/3, end ≥ start". The service walks the batch, upserts
    by natural key (school, year, term), and writes a single audit row.
    """
    rows = await SchoolTermsService.upsert_year(
        session, school_id, payload, actor_user_id=user.user_id
    )
    return TermsListResponse(items=[TermRead.model_validate(r) for r in rows])
