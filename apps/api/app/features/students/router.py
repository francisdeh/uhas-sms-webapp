"""HTTP routes for the Students domain."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.classes.model import Class
from app.features.students.model import Student
from app.features.students.schema import (
    StudentCreate,
    StudentRead,
    StudentsListResponse,
    StudentUpdate,
)
from app.features.students.service import StudentsService

router = APIRouter(prefix="/students", tags=["students"])


def _to_read(student: Student, cls: Class | None) -> StudentRead:
    """Build a StudentRead from the joined Student + optional Class.

    `model_construct(.., update=…)` does a single Pydantic pass —
    avoids the prior validate/dump/validate round-trip.
    """
    read = StudentRead.model_validate(student)
    if cls:
        return read.model_copy(
            update={"class_id": cls.id, "class_name": cls.name, "division": cls.division}
        )
    return read


@router.get("", response_model=StudentsListResponse, response_model_by_alias=True)
async def list_students(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
    division: Annotated[str | None, Query()] = None,
    active_only: Annotated[bool, Query(alias="activeOnly")] = False,
) -> StudentsListResponse:
    rows, total = await StudentsService.list_for_school(
        session,
        school_id,
        q=q,
        page=page,
        size=size,
        division=division,
        active_only=active_only,
    )
    return StudentsListResponse(
        items=[_to_read(s, c) for (s, c) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{student_id}", response_model=StudentRead, response_model_by_alias=True)
async def get_student(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StudentRead:
    student, cls = await StudentsService.get(session, school_id, student_id)
    return _to_read(student, cls)


@router.post(
    "",
    response_model=StudentRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    payload: StudentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StudentRead:
    student, cls = await StudentsService.create(session, school_id, payload)
    return _to_read(student, cls)


@router.patch("/{student_id}", response_model=StudentRead, response_model_by_alias=True)
async def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StudentRead:
    student, cls = await StudentsService.update(
        session, school_id, student_id, payload, actor_user_id=user.user_id
    )
    return _to_read(student, cls)


@router.post("/{student_id}/activate", response_model=StudentRead, response_model_by_alias=True)
async def activate_student(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StudentRead:
    student, cls = await StudentsService.set_active(session, school_id, student_id, active=True)
    return _to_read(student, cls)


@router.post("/{student_id}/deactivate", response_model=StudentRead, response_model_by_alias=True)
async def deactivate_student(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StudentRead:
    student, cls = await StudentsService.set_active(session, school_id, student_id, active=False)
    return _to_read(student, cls)
