"""HTTP routes for the Reports domain.

  GET /reports/school               → Admin overview
  GET /reports/division/{division}  → Deputy dashboard
  GET /reports/class/{class_id}     → Teacher dashboard
  GET /reports/psc                  → PSC census-style report (Admin)

Role gates live in `ReportsService`; the router hands off the JWT
context (`role`, `linked_id`) and lets the service decide.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.school_structure import Division
from app.features.reports.schema import (
    ClassStats,
    DivisionStats,
    PscReportData,
    SchoolStats,
)
from app.features.reports.service import ReportsService

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get(
    "/school",
    response_model=SchoolStats,
    response_model_by_alias=True,
)
async def get_school_report(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> SchoolStats:
    return await ReportsService.get_school_stats(session, school_id, actor_role=user.role or "")


@router.get(
    "/division/{division}",
    response_model=DivisionStats,
    response_model_by_alias=True,
)
async def get_division_report(
    division: Division,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> DivisionStats:
    return await ReportsService.get_division_stats(
        session,
        school_id,
        division,
        actor_role=user.role or "",
        actor_linked_id=user.linked_id,
    )


@router.get(
    "/class/{class_id}",
    response_model=ClassStats,
    response_model_by_alias=True,
)
async def get_class_report(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassStats:
    return await ReportsService.get_class_stats(
        session,
        school_id,
        class_id,
        actor_role=user.role or "",
        actor_linked_id=user.linked_id,
    )


@router.get(
    "/psc",
    response_model=PscReportData,
    response_model_by_alias=True,
)
async def get_psc_report(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> PscReportData:
    return await ReportsService.get_psc_report(session, school_id, actor_role=user.role or "")
