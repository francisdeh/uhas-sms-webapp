"""HTTP routes for the Appointments domain.

  GET    /appointments                     → own list (Parent | Teacher)
  GET    /appointments/{id}                → detail
  POST   /appointments                     → create (Parent)
  POST   /appointments/{id}/respond        → confirm / decline (Teacher | Admin)
  POST   /appointments/{id}/cancel         → cancel (owning Parent)

  GET    /appointments/teachers-for-student?studentId=<uuid>
                                            → picker helper (Parent | Admin)

The list endpoint automatically scopes by the caller's role — a Parent
sees their own requests, a Teacher sees their inbox. There's no
Admin-wide "all appointments" endpoint; that's out of scope.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import CurrentSchoolIdDep, CurrentUserDep
from app.core.errors import ForbiddenError
from app.core.roles import ADMIN, PARENT, TEACHER
from app.features.appointments.model import Appointment
from app.features.appointments.schema import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentRespond,
    AppointmentsListResponse,
    TeacherOption,
    TeacherOptionsResponse,
)
from app.features.appointments.service import AppointmentsService
from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.students.model import Student

router = APIRouter(prefix="/appointments", tags=["appointments"])


def _to_read(
    row: Appointment, guardian: Guardian, student: Student, teacher: Staff
) -> AppointmentRead:
    return AppointmentRead(
        id=row.id,
        school_id=row.school_id,
        guardian_id=row.guardian_id,
        guardian_name=f"{guardian.first_name} {guardian.last_name}",
        student_id=row.student_id,
        student_name=f"{student.first_name} {student.last_name}",
        teacher_id=row.teacher_id,
        teacher_name=f"{teacher.first_name} {teacher.last_name}",
        preferred_date=row.preferred_date,
        preferred_slot=row.preferred_slot,
        reason=row.reason,
        status=row.status,
        teacher_response=row.teacher_response,
        responded_at=row.responded_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "",
    response_model=AppointmentsListResponse,
    response_model_by_alias=True,
)
async def list_appointments(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    # The teacher/parent appointment inbox fetches its full pending queue
    # in one page rather than paginating a naturally small list.
    size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AppointmentsListResponse:
    if not user.linked_id:
        raise ForbiddenError("Actor identity missing.")

    if user.role == PARENT:
        rows, total = await AppointmentsService.list_for_guardian(
            session, school_id, user.linked_id, page=page, size=size
        )
    elif user.role == TEACHER:
        rows, total = await AppointmentsService.list_for_teacher(
            session, school_id, user.linked_id, page=page, size=size
        )
    else:
        raise ForbiddenError("Only Parent or Teacher can list appointments.")

    return AppointmentsListResponse(
        items=[_to_read(a, g, s, t) for (a, g, s, t) in rows],
        total=total,
        page=page,
        size=size,
    )


@router.get(
    "/teachers-for-student",
    response_model=TeacherOptionsResponse,
    response_model_by_alias=True,
)
async def teachers_for_student(
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
    student_id: Annotated[UUID, Query(alias="studentId")],
) -> TeacherOptionsResponse:
    rows = await AppointmentsService.teachers_for_student(
        session,
        school_id,
        student_id,
        actor_role=user.role or "",
        actor_linked_id=user.linked_id,
    )
    return TeacherOptionsResponse(
        items=[
            TeacherOption(
                id=staff.id,
                name=f"{staff.first_name} {staff.last_name}",
                subjects=subjects,
            )
            for staff, subjects in rows
        ]
    )


@router.get(
    "/{appointment_id}",
    response_model=AppointmentRead,
    response_model_by_alias=True,
)
async def get_appointment(
    appointment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AppointmentRead:
    """The caller must be a party to the appointment. Admin can always
    read; a Parent can only read their own; a Teacher can only read
    ones addressed to them."""
    row, guardian, student, teacher = await AppointmentsService.get(
        session, school_id, appointment_id
    )
    if user.role == PARENT and str(user.linked_id or "") == str(row.guardian_id):
        return _to_read(row, guardian, student, teacher)
    if user.role == TEACHER and str(user.linked_id or "") == str(row.teacher_id):
        return _to_read(row, guardian, student, teacher)
    if user.role == ADMIN:
        return _to_read(row, guardian, student, teacher)
    raise ForbiddenError("You may not view this appointment.")


@router.post(
    "",
    response_model=AppointmentRead,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
async def create_appointment(
    payload: AppointmentCreate,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AppointmentRead:
    if user.role != PARENT or not user.linked_id:
        raise ForbiddenError("Only a Parent can request an appointment.")
    row, guardian, student, teacher = await AppointmentsService.create(
        session, school_id, payload, guardian_id=user.linked_id
    )
    return _to_read(row, guardian, student, teacher)


@router.post(
    "/{appointment_id}/respond",
    response_model=AppointmentRead,
    response_model_by_alias=True,
)
async def respond_to_appointment(
    appointment_id: UUID,
    payload: AppointmentRespond,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> AppointmentRead:
    if not user.linked_id:
        raise ForbiddenError("Actor identity missing.")
    row, guardian, student, teacher = await AppointmentsService.respond(
        session,
        school_id,
        appointment_id,
        payload,
        actor_staff_id=user.linked_id,
        actor_role=user.role or "",
    )
    return _to_read(row, guardian, student, teacher)


@router.post(
    "/{appointment_id}/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_appointment(
    appointment_id: UUID,
    school_id: CurrentSchoolIdDep,
    session: Annotated[AsyncSession, Depends(get_session)],
    user: CurrentUserDep,
) -> None:
    if user.role != PARENT or not user.linked_id:
        raise ForbiddenError("Only the requesting parent can cancel.")
    await AppointmentsService.cancel(
        session,
        school_id,
        appointment_id,
        actor_guardian_id=user.linked_id,
    )
