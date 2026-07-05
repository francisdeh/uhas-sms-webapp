"""HTTP routes for Classes + its two junction sub-resources.

GET    /classes                                      → paginated list
GET    /classes/{id}                                 → fetch
POST   /classes                                      → create (Admin)
PATCH  /classes/{id}                                 → partial update (Admin)

GET    /classes/{id}/subjects                        → list assigned subjects
POST   /classes/{id}/subjects                        → assign subject (Admin)
PATCH  /classes/{id}/subjects/{sub_id}               → set/unset teacher (Admin)
DELETE /classes/{id}/subjects/{sub_id}               → unassign (Admin)

GET    /classes/{id}/teachers                        → list assigned teachers
POST   /classes/{id}/teachers                        → assign (Admin)
DELETE /classes/{id}/teachers/{staff_id}             → unassign (Admin)
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.classes.schema import (
    ClassCreate,
    ClassesListResponse,
    ClassRead,
    ClassSubjectAssignRequest,
    ClassSubjectLookupResponse,
    ClassSubjectLookupRow,
    ClassSubjectRead,
    ClassSubjectsListResponse,
    ClassSubjectTeacherUpdate,
    ClassTeacherAssignRequest,
    ClassTeacherRead,
    ClassTeachersListResponse,
    ClassUpdate,
)
from app.features.classes.service import (
    ClassesService,
    ClassSubjectsService,
    ClassTeachersService,
)
from app.features.staff.model import Staff
from app.features.subjects.model import Subject

router = APIRouter(prefix="/classes", tags=["classes"])


# ─── /classes ────────────────────────────────────────────────────────────────


def _to_class_read(
    cls: Class, student_count: int = 0, primary_teacher_name: str | None = None
) -> ClassRead:
    """Merge the Class row with the joined denormalised fields."""
    return ClassRead.model_validate(cls).model_copy(
        update={
            "student_count": student_count,
            "primary_teacher_name": primary_teacher_name,
        }
    )


@router.get("", response_model=ClassesListResponse, response_model_by_alias=True)
async def list_classes(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    q: Annotated[str | None, Query()] = None,
    division: Annotated[str | None, Query()] = None,
    academic_year: Annotated[str | None, Query(alias="academicYear")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # Classes are bounded by school structure, not row-count risk — several
    # frontend pages fetch "all classes" for a dropdown/lookup in one page
    # rather than paginating. 500 comfortably covers even a very large
    # school; matches the precedent set by the calendar endpoint.
    size: Annotated[int, Query(ge=1, le=500)] = 50,
) -> ClassesListResponse:
    rows, total = await ClassesService.list_for_school(
        session,
        school_id,
        user,
        q=q,
        division=division,
        academic_year=academic_year,
        page=page,
        size=size,
    )
    return ClassesListResponse(
        items=[_to_class_read(c, sc, tn) for (c, sc, tn) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{class_id}", response_model=ClassRead, response_model_by_alias=True)
async def get_class(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> ClassRead:
    cls, student_count, primary_teacher_name = await ClassesService.get_enriched(
        session, school_id, class_id, user
    )
    return _to_class_read(cls, student_count, primary_teacher_name)


@router.post(
    "",
    response_model=ClassRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_class(
    payload: ClassCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ClassRead:
    row = await ClassesService.create(session, school_id, payload)
    # Fresh class has no enrolments or teachers — defaults are correct.
    return _to_class_read(row)


@router.patch("/{class_id}", response_model=ClassRead, response_model_by_alias=True)
async def update_class(
    class_id: UUID,
    payload: ClassUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ClassRead:
    await ClassesService.update(session, school_id, class_id, payload)
    # Re-read the enriched shape so the response carries the same
    # fields the list/detail return — keeps client code uniform.
    cls, student_count, primary_teacher_name = await ClassesService.get_enriched(
        session, school_id, class_id, user
    )
    return _to_class_read(cls, student_count, primary_teacher_name)


# ─── /classes/{id}/subjects ──────────────────────────────────────────────────


def _to_class_subject_read(
    cs: ClassSubject, subject: Subject, teacher: Staff | None
) -> ClassSubjectRead:
    return ClassSubjectRead(
        class_id=cs.class_id,
        subject_id=cs.subject_id,
        subject_slug=subject.slug,
        subject_name=subject.name,
        teacher_id=cs.teacher_id,
        teacher_first_name=teacher.first_name if teacher else None,
        teacher_last_name=teacher.last_name if teacher else None,
    )


@router.get(
    "/{class_id}/subjects",
    response_model=ClassSubjectsListResponse,
    response_model_by_alias=True,
)
async def list_class_subjects(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClassSubjectsListResponse:
    rows = await ClassSubjectsService.list_for_class(session, school_id, class_id)
    return ClassSubjectsListResponse(
        items=[_to_class_subject_read(cs, s, t) for (cs, s, t) in rows]
    )


@router.post(
    "/{class_id}/subjects",
    response_model=ClassSubjectRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def assign_class_subject(
    class_id: UUID,
    payload: ClassSubjectAssignRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ClassSubjectRead:
    cs, subject, teacher = await ClassSubjectsService.assign(session, school_id, class_id, payload)
    return _to_class_subject_read(cs, subject, teacher)


@router.patch(
    "/{class_id}/subjects/{subject_id}",
    response_model=ClassSubjectRead,
    response_model_by_alias=True,
)
async def set_class_subject_teacher(
    class_id: UUID,
    subject_id: UUID,
    payload: ClassSubjectTeacherUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ClassSubjectRead:
    cs, subject, teacher = await ClassSubjectsService.set_teacher(
        session, school_id, class_id, subject_id, payload
    )
    return _to_class_subject_read(cs, subject, teacher)


@router.delete(
    "/{class_id}/subjects/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_class_subject(
    class_id: UUID,
    subject_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> None:
    await ClassSubjectsService.remove(session, school_id, class_id, subject_id)


# ─── /classes/{id}/teachers ──────────────────────────────────────────────────


def _to_class_teacher_read(ct: ClassTeacher, staff: Staff) -> ClassTeacherRead:
    return ClassTeacherRead(
        class_id=ct.class_id,
        staff_id=ct.staff_id,
        staff_first_name=staff.first_name,
        staff_last_name=staff.last_name,
        is_primary=bool(ct.is_primary),
    )


@router.get(
    "/{class_id}/teachers",
    response_model=ClassTeachersListResponse,
    response_model_by_alias=True,
)
async def list_class_teachers(
    class_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ClassTeachersListResponse:
    rows = await ClassTeachersService.list_for_class(session, school_id, class_id)
    return ClassTeachersListResponse(items=[_to_class_teacher_read(ct, s) for (ct, s) in rows])


@router.post(
    "/{class_id}/teachers",
    response_model=ClassTeacherRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def assign_class_teacher(
    class_id: UUID,
    payload: ClassTeacherAssignRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> ClassTeacherRead:
    ct, staff = await ClassTeachersService.assign(session, school_id, class_id, payload)
    return _to_class_teacher_read(ct, staff)


@router.delete(
    "/{class_id}/teachers/{staff_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_class_teacher(
    class_id: UUID,
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> None:
    await ClassTeachersService.remove(session, school_id, class_id, staff_id)


# ─── /class-subjects (top-level inverse lookups) ─────────────────────────────
# Kept in this file so all class_subjects surfaces are discoverable in one
# place. Mounted separately in main.py because the prefix (`/class-subjects`)
# is disjoint from `/classes`.

class_subjects_router = APIRouter(prefix="/class-subjects", tags=["classes"])


@class_subjects_router.get(
    "",
    response_model=ClassSubjectLookupResponse,
    response_model_by_alias=True,
    summary="Inverse lookup on class_subjects by subject XOR teacher",
)
async def list_class_subjects_by(
    user: CurrentUserDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    subject_id: Annotated[UUID | None, Query(alias="subjectId")] = None,
    teacher_id: Annotated[UUID | None, Query(alias="teacherId")] = None,
) -> ClassSubjectLookupResponse:
    rows = await ClassSubjectsService.list_class_subjects(
        session,
        user,
        subject_id=subject_id,
        teacher_id=teacher_id,
    )
    return ClassSubjectLookupResponse(
        rows=[
            ClassSubjectLookupRow(
                class_id=r.class_id,
                class_name=r.class_name,
                class_slug=r.class_slug,
                division=r.division,
                subject_id=r.subject_id,
                subject_name=r.subject_name,
                subject_slug=r.subject_slug,
                teacher_id=r.teacher_id,
                teacher_name=r.teacher_name,
            )
            for r in rows
        ]
    )
