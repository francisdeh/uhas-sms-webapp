"""HTTP routes for the Students domain."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.core.errors import ForbiddenError
from app.features.classes.model import Class
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentDocument
from app.features.students.schema import (
    SiblingRead,
    StudentCreate,
    StudentDocumentCreate,
    StudentDocumentRead,
    StudentGuardianAddRequest,
    StudentGuardianRead,
    StudentGuardianUpdateRequest,
    StudentMedicalRead,
    StudentMedicalUpdate,
    StudentRead,
    StudentsListResponse,
    StudentUpdate,
)
from app.features.students.service import StudentsService

router = APIRouter(prefix="/students", tags=["students"])


def _document_to_read(document: StudentDocument, staff: Staff) -> StudentDocumentRead:
    return StudentDocumentRead(
        id=document.id,
        student_id=document.student_id,
        label=document.label,
        other_label=document.other_label,
        storage_path=document.storage_path,
        uploaded_by_id=document.uploaded_by_id,
        uploaded_by_name=f"{staff.first_name} {staff.last_name}".strip(),
        created_at=document.created_at,
    )


def _guardian_to_read(
    guardian: Guardian, relation: str | None, is_primary: bool, has_login: bool
) -> StudentGuardianRead:
    return StudentGuardianRead(
        id=guardian.id,
        slug=guardian.slug,
        name=f"{guardian.first_name} {guardian.last_name}".strip(),
        relationship=relation or "Guardian",
        is_primary=is_primary,
        has_login=has_login,
        is_staff=guardian.staff_id is not None,
        phone=guardian.phone,
        email=guardian.email,
    )


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
    staff_child: Annotated[bool, Query(alias="staffChild")] = False,
) -> StudentsListResponse:
    rows, total = await StudentsService.list_for_school(
        session,
        school_id,
        q=q,
        page=page,
        size=size,
        division=division,
        active_only=active_only,
        staff_child=staff_child,
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


@router.get(
    "/{student_id}/guardians",
    response_model=list[StudentGuardianRead],
    response_model_by_alias=True,
    summary="All guardians linked to a student",
)
async def list_student_guardians(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> list[StudentGuardianRead]:
    rows = await StudentsService.list_guardians(session, school_id, student_id, user=user)
    return [_guardian_to_read(g, rel, primary, has_login) for g, rel, primary, has_login in rows]


@router.post(
    "/{student_id}/guardians",
    response_model=list[StudentGuardianRead],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Link an existing guardian or create + link a new one",
)
async def add_student_guardian(
    student_id: UUID,
    payload: StudentGuardianAddRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StudentGuardianRead]:
    rows = await StudentsService.add_guardian(
        session, school_id, student_id, payload, actor_user_id=user.user_id
    )
    return [_guardian_to_read(g, rel, primary, has_login) for g, rel, primary, has_login in rows]


@router.patch(
    "/{student_id}/guardians/{guardian_id}",
    response_model=list[StudentGuardianRead],
    response_model_by_alias=True,
    summary="Edit a student↔guardian link (relation, primary)",
)
async def update_student_guardian(
    student_id: UUID,
    guardian_id: UUID,
    payload: StudentGuardianUpdateRequest,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StudentGuardianRead]:
    rows = await StudentsService.update_guardian_link(
        session, school_id, student_id, guardian_id, payload, actor_user_id=user.user_id
    )
    return [_guardian_to_read(g, rel, primary, has_login) for g, rel, primary, has_login in rows]


@router.delete(
    "/{student_id}/guardians/{guardian_id}",
    response_model=list[StudentGuardianRead],
    response_model_by_alias=True,
    summary="Unlink a guardian from a student (guardian record kept)",
)
async def remove_student_guardian(
    student_id: UUID,
    guardian_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StudentGuardianRead]:
    rows = await StudentsService.remove_guardian(
        session, school_id, student_id, guardian_id, actor_user_id=user.user_id
    )
    return [_guardian_to_read(g, rel, primary, has_login) for g, rel, primary, has_login in rows]


@router.get(
    "/{student_id}/siblings",
    response_model=list[SiblingRead],
    response_model_by_alias=True,
    summary="Students who share a guardian with this student",
)
async def list_student_siblings(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> list[SiblingRead]:
    rows = await StudentsService.list_siblings(session, school_id, student_id, user=user)
    return [
        SiblingRead(
            id=s.id,
            slug=s.slug,
            name=f"{s.first_name} {s.last_name}".strip(),
            class_name=c.name if c else None,
        )
        for s, c in rows
    ]


@router.get(
    "/{student_id}/medical",
    response_model=StudentMedicalRead,
    response_model_by_alias=True,
    summary="A student's medical info — Admin/Deputy/teacher/own-parent only",
)
async def get_student_medical(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> StudentMedicalRead:
    student = await StudentsService.get_medical(session, school_id, student_id, user=user)
    return StudentMedicalRead.model_validate(student)


@router.patch(
    "/{student_id}/medical",
    response_model=StudentMedicalRead,
    response_model_by_alias=True,
    summary="Edit a student's medical info — Admin or the student's own parent",
)
async def update_student_medical(
    student_id: UUID,
    payload: StudentMedicalUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> StudentMedicalRead:
    student = await StudentsService.update_medical(
        session, school_id, student_id, payload, user=user
    )
    return StudentMedicalRead.model_validate(student)


@router.get(
    "/{student_id}/documents",
    response_model=list[StudentDocumentRead],
    response_model_by_alias=True,
    summary="A student's uploaded documents — Admin/Deputy/own-parent only",
)
async def list_student_documents(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> list[StudentDocumentRead]:
    rows = await StudentsService.list_documents(session, school_id, student_id, user=user)
    return [_document_to_read(d, s) for d, s in rows]


@router.post(
    "/{student_id}/documents",
    response_model=list[StudentDocumentRead],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document for a student — Admin only",
)
async def add_student_document(
    student_id: UUID,
    payload: StudentDocumentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StudentDocumentRead]:
    if not user.linked_id:
        raise ForbiddenError("Cannot upload a document without a staff identity.")
    rows = await StudentsService.add_document(
        session, school_id, student_id, payload, actor_staff_id=user.linked_id
    )
    return [_document_to_read(d, s) for d, s in rows]


@router.delete(
    "/{student_id}/documents/{document_id}",
    response_model=list[StudentDocumentRead],
    response_model_by_alias=True,
    summary="Remove a student's document — Admin only",
)
async def remove_student_document(
    student_id: UUID,
    document_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StudentDocumentRead]:
    rows = await StudentsService.remove_document(session, school_id, student_id, document_id)
    return [_document_to_read(d, s) for d, s in rows]


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
    student, cls = await StudentsService.set_active(
        session, school_id, student_id, active=True, actor_user_id=user.user_id
    )
    return _to_read(student, cls)


@router.post("/{student_id}/deactivate", response_model=StudentRead, response_model_by_alias=True)
async def deactivate_student(
    student_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StudentRead:
    student, cls = await StudentsService.set_active(
        session, school_id, student_id, active=False, actor_user_id=user.user_id
    )
    return _to_read(student, cls)
