"""HTTP routes for the Guardians domain.

Mostly mirrors Staff. Write operations gated to `Admin`; reads open
to any authenticated user (Parent + Teacher contact lookups).
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.guardians.schema import (
    GuardianCreate,
    GuardianRead,
    GuardiansListResponse,
    GuardianUpdate,
)
from app.features.guardians.service import GuardiansService

router = APIRouter(prefix="/guardians", tags=["guardians"])


@router.get("", response_model=GuardiansListResponse, response_model_by_alias=True)
async def list_guardians(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> GuardiansListResponse:
    rows, total = await GuardiansService.list_for_school(
        session, school_id, q=q, page=page, size=size
    )
    return GuardiansListResponse(
        items=[GuardianRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{guardian_id}", response_model=GuardianRead, response_model_by_alias=True)
async def get_guardian(
    guardian_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GuardianRead:
    row = await GuardiansService.get(session, school_id, guardian_id)
    return GuardianRead.model_validate(row)


@router.post(
    "",
    response_model=GuardianRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_guardian(
    payload: GuardianCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> GuardianRead:
    row = await GuardiansService.create(session, school_id, payload)
    return GuardianRead.model_validate(row)


@router.patch("/{guardian_id}", response_model=GuardianRead, response_model_by_alias=True)
async def update_guardian(
    guardian_id: UUID,
    payload: GuardianUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> GuardianRead:
    row = await GuardiansService.update(session, school_id, guardian_id, payload)
    return GuardianRead.model_validate(row)
