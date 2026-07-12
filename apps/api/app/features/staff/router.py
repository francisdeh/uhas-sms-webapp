"""HTTP routes for the Staff domain.

Core staff CRUD — one endpoint per Admin UI action:

  GET    /staff              → paginated list (server-side q + cursor)
  GET    /staff/{id}         → fetch single
  POST   /staff              → create
  PATCH  /staff/{id}         → partial update
  PATCH  /staff/{id}/role    → role change (audit-logged)
  PATCH  /staff/{id}/unit-head → toggle unit-head flag
  POST   /staff/{id}/activate   → reactivate
  POST   /staff/{id}/deactivate → deactivate

All writes require `Admin`, except `PATCH /staff/{id}` — non-Admin staff
can patch `photo_url` on their own row so the profile page can update
avatars without a separate endpoint. Reads are open to any authenticated
user; several pages (lesson plan reviewer list, class-teacher dropdown)
need to see staff names.

Profile-depth sub-resources (Phase 6 item 4):

  GET    /staff/{id}/subjects              → open read
  PUT    /staff/{id}/subjects              → Admin only (full-replace)
  GET    /staff/{id}/qualifications        → open read
  POST   /staff/{id}/qualifications        → Admin only
  DELETE /staff/{id}/qualifications/{id}   → Admin only
  GET    /staff/{id}/documents             → Admin any, staff their own only
  POST   /staff/{id}/documents             → Admin only
  DELETE /staff/{id}/documents/{id}        → Admin only

Documents are gated more tightly than the rest of this feature's
open-read precedent — certificates/contracts aren't something every
logged-in user should be able to pull up for a colleague.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep, RequireAdmin
from app.core.errors import ForbiddenError
from app.features.staff.model import Staff, StaffDocument, StaffQualification
from app.features.staff.schema import (
    StaffCreate,
    StaffDocumentCreate,
    StaffDocumentRead,
    StaffListResponse,
    StaffQualificationCreate,
    StaffQualificationRead,
    StaffRead,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
    SubjectExpertiseRead,
    SubjectExpertiseUpdate,
)
from app.features.staff.service import StaffService

router = APIRouter(prefix="/staff", tags=["staff"])


def _document_to_read(document: StaffDocument, uploader: Staff) -> StaffDocumentRead:
    return StaffDocumentRead(
        id=document.id,
        staff_id=document.staff_id,
        label=document.label,
        other_label=document.other_label,
        storage_path=document.storage_path,
        uploaded_by_id=document.uploaded_by_id,
        uploaded_by_name=f"{uploader.first_name} {uploader.last_name}".strip(),
        created_at=document.created_at,
    )


def _qualification_to_read(qualification: StaffQualification) -> StaffQualificationRead:
    return StaffQualificationRead(
        id=qualification.id,
        staff_id=qualification.staff_id,
        name=qualification.name,
        institution=qualification.institution,
        year_obtained=qualification.year_obtained,
        created_at=qualification.created_at,
    )


@router.get("", response_model=StaffListResponse, response_model_by_alias=True)
async def list_staff(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    q: Annotated[str | None, Query(description="Search across name + email + UHAS ID")] = None,
    page: Annotated[int, Query(ge=1, description="1-based page index")] = 1,
    # Staff is bounded by school size, not row-count risk — several
    # frontend pages fetch "all staff" for a dropdown/lookup in one page
    # rather than paginating. 500 comfortably covers even a very large
    # school; matches the precedent set by the calendar endpoint.
    size: Annotated[int, Query(ge=1, le=500, description="Rows per page")] = 50,
    active_only: Annotated[bool, Query(alias="activeOnly")] = False,
) -> StaffListResponse:
    rows, total = await StaffService.list_for_school(
        session,
        school_id,
        q=q,
        page=page,
        size=size,
        active_only=active_only,
    )
    return StaffListResponse(
        items=[StaffRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get("/{staff_id}", response_model=StaffRead, response_model_by_alias=True)
async def get_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StaffRead:
    row = await StaffService.get(session, school_id, staff_id)
    return StaffRead.model_validate(row)


@router.post(
    "",
    response_model=StaffRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_staff(
    payload: StaffCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.create(session, school_id, payload)
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}", response_model=StaffRead, response_model_by_alias=True)
async def update_staff(
    staff_id: UUID,
    payload: StaffUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> StaffRead:
    row = await StaffService.update(session, school_id, staff_id, payload, user=user)
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}/role", response_model=StaffRead, response_model_by_alias=True)
async def change_role(
    staff_id: UUID,
    payload: StaffRoleChange,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.change_role(
        session, school_id, staff_id, payload, actor_user_id=user.user_id
    )
    return StaffRead.model_validate(row)


@router.patch("/{staff_id}/unit-head", response_model=StaffRead, response_model_by_alias=True)
async def toggle_unit_head(
    staff_id: UUID,
    payload: StaffUnitHeadToggle,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.toggle_unit_head(session, school_id, staff_id, payload)
    return StaffRead.model_validate(row)


@router.post("/{staff_id}/activate", response_model=StaffRead, response_model_by_alias=True)
async def activate_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.set_active(session, school_id, staff_id, active=True)
    return StaffRead.model_validate(row)


@router.post("/{staff_id}/deactivate", response_model=StaffRead, response_model_by_alias=True)
async def deactivate_staff(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> StaffRead:
    row = await StaffService.set_active(session, school_id, staff_id, active=False)
    return StaffRead.model_validate(row)


@router.get(
    "/{staff_id}/subjects",
    response_model=list[SubjectExpertiseRead],
    response_model_by_alias=True,
    summary="Subjects this staff member is qualified to teach",
)
async def list_staff_subjects(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SubjectExpertiseRead]:
    rows = await StaffService.list_subject_expertise(session, school_id, staff_id)
    return [SubjectExpertiseRead(id=s.id, slug=s.slug, name=s.name) for s in rows]


@router.put(
    "/{staff_id}/subjects",
    response_model=list[SubjectExpertiseRead],
    response_model_by_alias=True,
    summary="Replace this staff member's subject expertise — Admin only",
)
async def replace_staff_subjects(
    staff_id: UUID,
    payload: SubjectExpertiseUpdate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[SubjectExpertiseRead]:
    rows = await StaffService.replace_subject_expertise(
        session, school_id, staff_id, payload.subject_ids
    )
    return [SubjectExpertiseRead(id=s.id, slug=s.slug, name=s.name) for s in rows]


@router.get(
    "/{staff_id}/qualifications",
    response_model=list[StaffQualificationRead],
    response_model_by_alias=True,
)
async def list_staff_qualifications(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[StaffQualificationRead]:
    rows = await StaffService.list_qualifications(session, school_id, staff_id)
    return [_qualification_to_read(q) for q in rows]


@router.post(
    "/{staff_id}/qualifications",
    response_model=list[StaffQualificationRead],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Add a qualification — Admin only",
)
async def add_staff_qualification(
    staff_id: UUID,
    payload: StaffQualificationCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StaffQualificationRead]:
    rows = await StaffService.add_qualification(session, school_id, staff_id, payload)
    return [_qualification_to_read(q) for q in rows]


@router.delete(
    "/{staff_id}/qualifications/{qualification_id}",
    response_model=list[StaffQualificationRead],
    response_model_by_alias=True,
    summary="Remove a qualification — Admin only",
)
async def remove_staff_qualification(
    staff_id: UUID,
    qualification_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StaffQualificationRead]:
    rows = await StaffService.remove_qualification(session, school_id, staff_id, qualification_id)
    return [_qualification_to_read(q) for q in rows]


@router.get(
    "/{staff_id}/documents",
    response_model=list[StaffDocumentRead],
    response_model_by_alias=True,
    summary="A staff member's documents — Admin any, staff their own only",
)
async def list_staff_documents(
    staff_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> list[StaffDocumentRead]:
    rows = await StaffService.list_documents(session, school_id, staff_id, user=user)
    return [_document_to_read(d, s) for d, s in rows]


@router.post(
    "/{staff_id}/documents",
    response_model=list[StaffDocumentRead],
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
    summary="Upload a document for a staff member — Admin only",
)
async def add_staff_document(
    staff_id: UUID,
    payload: StaffDocumentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StaffDocumentRead]:
    if not user.linked_id:
        raise ForbiddenError("Cannot upload a document without a staff identity.")
    rows = await StaffService.add_document(
        session, school_id, staff_id, payload, actor_staff_id=user.linked_id
    )
    return [_document_to_read(d, s) for d, s in rows]


@router.delete(
    "/{staff_id}/documents/{document_id}",
    response_model=list[StaffDocumentRead],
    response_model_by_alias=True,
    summary="Remove a staff member's document — Admin only",
)
async def remove_staff_document(
    staff_id: UUID,
    document_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: RequireAdmin,
) -> list[StaffDocumentRead]:
    rows = await StaffService.remove_document(session, school_id, staff_id, document_id)
    return [_document_to_read(d, s) for d, s in rows]
