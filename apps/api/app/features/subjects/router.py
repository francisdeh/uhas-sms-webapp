"""HTTP routes for the Subjects domain."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.subjects.schema import (
    SubjectCreate,
    SubjectRead,
    SubjectsListResponse,
    SubjectUpdate,
)
from app.features.subjects.service import SubjectsService

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("", response_model=SubjectsListResponse, response_model_by_alias=True)
async def list_subjects(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query()] = None,
    division: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> SubjectsListResponse:
    rows, total = await SubjectsService.list_for_school(
        session, school_id, q=q, division=division, page=page, size=size
    )
    return SubjectsListResponse(
        items=[SubjectRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{subject_id}", response_model=SubjectRead, response_model_by_alias=True)
async def get_subject(
    subject_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SubjectRead:
    row = await SubjectsService.get(session, school_id, subject_id)
    return SubjectRead.model_validate(row)


@router.post(
    "",
    response_model=SubjectRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_subject(
    payload: SubjectCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> SubjectRead:
    row = await SubjectsService.create(session, school_id, payload)
    return SubjectRead.model_validate(row)


@router.patch("/{subject_id}", response_model=SubjectRead, response_model_by_alias=True)
async def update_subject(
    subject_id: UUID,
    payload: SubjectUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> SubjectRead:
    row = await SubjectsService.update(session, school_id, subject_id, payload)
    return SubjectRead.model_validate(row)
