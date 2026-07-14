"""HTTP routes for the Enrollments domain.

GET   /enrollments                          → 400 (must scope by student or class)
POST  /enrollments                          → enrol student in class (Admin)
GET   /enrollments/{id}                     → fetch
PATCH /enrollments/{id}                     → change status (Admin)

GET   /students/{student_id}/enrollments    → history for a student
GET   /classes/{class_id}/enrollments       → roster for a class
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, RequireAdmin
from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.enrollments.schema import (
    EnrollmentCreate,
    EnrollmentRead,
    EnrollmentsListResponse,
    EnrollmentStatusUpdate,
)
from app.features.enrollments.service import EnrollmentsService
from app.features.students.model import Student


def _to_read(enrollment: Enrollment, cls: Class, student: Student) -> EnrollmentRead:
    return EnrollmentRead(
        id=enrollment.id,
        student_id=enrollment.student_id,
        class_id=enrollment.class_id,
        class_name=cls.name,
        division=cls.division,
        academic_year=enrollment.academic_year,
        status=enrollment.status,
        enrollment_date=enrollment.enrollment_date,
        student_slug=student.slug,
        student_first_name=student.first_name,
        student_last_name=student.last_name,
        student_gender=student.gender,
        student_photo_url=student.photo_url,
        student_is_active=student.is_active,
    )


# ─── /enrollments (top-level) ────────────────────────────────────────────────

router = APIRouter(prefix="/enrollments", tags=["enrollments"])


@router.post(
    "",
    response_model=EnrollmentRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_student(
    payload: EnrollmentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> EnrollmentRead:
    enrollment, cls, student = await EnrollmentsService.enroll(session, school_id, payload)
    return _to_read(enrollment, cls, student)


@router.patch("/{enrollment_id}", response_model=EnrollmentRead, response_model_by_alias=True)
async def change_enrollment_status(
    enrollment_id: UUID,
    payload: EnrollmentStatusUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> EnrollmentRead:
    enrollment, cls, student = await EnrollmentsService.change_status(
        session, school_id, enrollment_id, payload
    )
    return _to_read(enrollment, cls, student)


# ─── Nested lookups under /students and /classes ─────────────────────────────
# Mounted separately in main.py; kept in this file so all enrollment
# routes are discoverable in one place.

students_router = APIRouter(prefix="/students/{student_id}/enrollments", tags=["enrollments"])


@students_router.get("", response_model=EnrollmentsListResponse, response_model_by_alias=True)
async def list_student_enrollments(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> EnrollmentsListResponse:
    rows, total = await EnrollmentsService.list_for_student(
        session, school_id, student_id, page=page, size=size
    )
    return EnrollmentsListResponse(
        items=[_to_read(e, c, s) for (e, c, s) in rows],
        total=total,
        page=page,
        size=size,
    )


classes_router = APIRouter(prefix="/classes/{class_id}/enrollments", tags=["enrollments"])


@classes_router.get("", response_model=EnrollmentsListResponse, response_model_by_alias=True)
async def list_class_enrollments(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # A class roster is bounded by school size like classes/staff — the
    # attendance-taking view fetches the whole roster in one page.
    size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> EnrollmentsListResponse:
    rows, total = await EnrollmentsService.list_for_class(
        session, school_id, class_id, status=status_filter, page=page, size=size
    )
    return EnrollmentsListResponse(
        items=[_to_read(e, c, s) for (e, c, s) in rows],
        total=total,
        page=page,
        size=size,
    )
