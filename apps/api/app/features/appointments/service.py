"""Business logic for the Appointments domain.

Three orthogonal concerns, in the order the request handlers hit them:

  1. **Ownership + role gates**
     * `create` — only Parents; the guardian id comes from the JWT
       `linked_id`, so a parent can never pretend to be another.
     * `respond` — only the appointment's `teacher_id` (or Admin).
     * `cancel` — only the appointment's `guardian_id`.

  2. **Domain gates**
     * The guardian must actually be linked to the student
       (`student_guardians`).
     * The teacher must actually teach the student's current-year class
       (class-teacher or subject-teacher).
     * The preferred date can't be in the past.
     * Once decided (`confirmed` / `declined` / `cancelled`) the row is
       terminal — no re-decide.

  3. **Notification fan-out** — in-app always; email + SMS on top,
     gated by `_notify_appointment_channels` (school-level
     `notification_defaults` toggle + per-user `user_preferences`,
     same two-tier gate as lesson-plan-rejection/results-published).
     Every outbound email also gets the school's name/address/contact
     email plus a role-appropriate "manage preferences" link merged
     into `email_data` here, so call sites never repeat that.
     * On `create` → notify the target teacher (`appointment_requested`,
       direction `"activity"`).
     * On `respond` → notify the guardian (`appointment_decided`,
       direction `"decided"`).
     * On `cancel` → notify the target teacher (`appointment_cancelled`,
       direction `"activity"`) — previously nothing told them at all.

Not built here: recurring appointments, teacher-side proposals, or a
timezone-aware slot picker — all deliberately out of scope.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.roles import ADMIN, PARENT
from app.features.appointments.constants import (
    CANCELLED,
    CONFIRM,
    CONFIRMED,
    DECLINE,
    DECLINED,
    PENDING,
    Decision,
)
from app.features.appointments.model import Appointment
from app.features.appointments.repository import AppointmentsRepository
from app.features.appointments.schema import AppointmentCreate, AppointmentRespond
from app.features.guardians.model import Guardian
from app.features.notifications.audience import UserAudience
from app.features.notifications.constants import (
    APPOINTMENT_CANCELLED,
    APPOINTMENT_DECIDED,
    APPOINTMENT_REQUESTED,
)
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.service import SchoolsService
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.users.model import User, UserPreferences

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _today() -> date:
    return datetime.now(UTC).date()


async def _notify_appointment_channels(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    recipient_user: User,
    recipient_phone: str | None,
    recipient_guardian_id: UUID | str | None,
    direction: str,
    email_event: str,
    email_data: dict[str, Any],
    sms_body: str,
) -> None:
    """Email + SMS fan-out for appointment events, on top of the
    in-app notification each call site already writes. `direction` is
    `"activity"` (teacher-facing — request/cancel) or `"decided"`
    (parent-facing — confirm/decline); it selects both the school-level
    `notification_defaults` toggle and the per-user `user_preferences`
    columns to check. Same two-tier gate + best-effort emit pattern as
    `ExamsService._notify_results_published`.
    """
    school = await SchoolsService.get(session, school_id)
    defaults = school.notification_defaults or {}
    if not defaults.get(f"on_appointment_{direction}", True):
        return

    prefs = await session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == recipient_user.id)
    )
    email_allowed = getattr(prefs, f"email_on_appointment_{direction}", True) if prefs else True
    sms_allowed = getattr(prefs, f"sms_on_appointment_{direction}", True) if prefs else True

    if recipient_user.email and email_allowed:
        preferences_path = (
            "/teacher/profile?tab=notifications"
            if direction == "activity"
            else "/parent/profile?tab=notifications"
        )
        try:
            await inngest_client.send(
                inngest.Event(
                    name=email_event,
                    data={
                        **email_data,
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or school.email_reply_to or "",
                        "preferences_link": preferences_path,
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit %s for school %s", email_event, school_id)
            sentry_sdk.capture_exception()

    if recipient_phone and sms_allowed:
        try:
            await inngest_client.send(
                inngest.Event(
                    name="sms/fanout.requested",
                    data={
                        "school_id": str(school_id),
                        "category": "appointment",
                        "body": sms_body,
                        "recipients": [
                            {
                                "phone": recipient_phone,
                                "guardian_id": (
                                    str(recipient_guardian_id) if recipient_guardian_id else None
                                ),
                            }
                        ],
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit appointment SMS fan-out for school %s", school_id)
            sentry_sdk.capture_exception()


class AppointmentsService:
    # ─── Reads ─────────────────────────────────────────────────────────

    @staticmethod
    async def list_for_guardian(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Appointment, Guardian, Student, Staff]], int]:
        return await AppointmentsRepository.list_for_guardian(
            session, school_id, guardian_id, page=page, size=size
        )

    @staticmethod
    async def list_for_teacher(
        session: AsyncSession,
        school_id: UUID | str,
        teacher_id: UUID | str,
        *,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Appointment, Guardian, Student, Staff]], int]:
        return await AppointmentsRepository.list_for_teacher(
            session, school_id, teacher_id, page=page, size=size
        )

    @staticmethod
    async def get(
        session: AsyncSession,
        school_id: UUID | str,
        appointment_id: UUID | str,
    ) -> tuple[Appointment, Guardian, Student, Staff]:
        row = await AppointmentsRepository.get_by_id(session, school_id, appointment_id)
        if not row:
            raise NotFoundError(f"Appointment {appointment_id!r} not found.")
        return row

    @staticmethod
    async def teachers_for_student(
        session: AsyncSession,
        school_id: UUID | str,
        student_id: UUID | str,
        *,
        actor_role: str,
        actor_linked_id: UUID | str | None,
    ) -> list[tuple[Staff, list[str]]]:
        """Powers the parent-side teacher picker. Only Parents can call
        this (and only for their own children) — otherwise a parent
        could enumerate any student's teacher list.

        Admin is allowed for admin tooling scenarios."""
        if actor_role == ADMIN:
            pass
        elif actor_role == PARENT and actor_linked_id:
            if not await AppointmentsRepository.guardian_owns_student(
                session,
                guardian_id=actor_linked_id,
                student_id=student_id,
            ):
                raise ForbiddenError("That child is not linked to your account.")
        else:
            raise ForbiddenError("Only a parent can look up teachers for a student.")

        school = await SchoolsService.get(session, school_id)
        return await AppointmentsRepository.teachers_for_student(
            session, student_id, academic_year=school.academic_year
        )

    # ─── Mutations ─────────────────────────────────────────────────────

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: AppointmentCreate,
        *,
        guardian_id: UUID | str,
    ) -> tuple[Appointment, Guardian, Student, Staff]:
        # 1. Guardian must own the child.
        if not await AppointmentsRepository.guardian_owns_student(
            session, guardian_id=guardian_id, student_id=payload.student_id
        ):
            raise ForbiddenError("That child is not linked to your account.")

        # 2. Teacher must actually teach the child's current class.
        school = await SchoolsService.get(session, school_id)
        if not await AppointmentsRepository.teacher_teaches_student(
            session,
            teacher_id=payload.teacher_id,
            student_id=payload.student_id,
            academic_year=school.academic_year,
        ):
            raise ValidationError("That teacher does not teach your child.")

        # 3. Date sanity.
        if payload.preferred_date < _today():
            raise ValidationError("Preferred date cannot be in the past.")

        row = Appointment(
            school_id=school_id,
            guardian_id=guardian_id,
            student_id=payload.student_id,
            teacher_id=payload.teacher_id,
            preferred_date=payload.preferred_date,
            preferred_slot=payload.preferred_slot,
            reason=payload.reason,
            status=PENDING,
        )
        session.add(row)
        await session.flush()

        # 4. Notify the teacher — silent no-op if no user linked yet.
        teacher_user = await NotificationsService.find_user_for_linked(
            session, school_id, payload.teacher_id
        )
        if teacher_user is not None:
            fetched = await AppointmentsService.get(session, school_id, row.id)
            _, guardian, student, teacher = fetched
            guardian_name = f"{guardian.first_name} {guardian.last_name}"
            await NotificationsService.notify_audience(
                session,
                school_id,
                UserAudience(user_id=teacher_user.id),
                NotifyPayload(
                    kind=APPOINTMENT_REQUESTED,
                    title="Appointment requested",
                    body=f"{guardian_name} would like to meet about {student.first_name}.",
                    link="/teacher/appointments",
                ),
            )
            await _notify_appointment_channels(
                session,
                school_id,
                recipient_user=teacher_user,
                recipient_phone=teacher.phone,
                recipient_guardian_id=None,
                direction="activity",
                email_event="email/appointment-requested.requested",
                email_data={
                    "teacher_email": teacher_user.email,
                    "teacher_name": f"{teacher.first_name} {teacher.last_name}",
                    "guardian_name": guardian_name,
                    "student_name": student.first_name,
                    "reason": payload.reason or "",
                    "link": "/teacher/appointments",
                },
                sms_body=(
                    f"New appointment request from {guardian_name} about "
                    f"{student.first_name}. Check UHAS SMS to respond."
                ),
            )

        return await AppointmentsService.get(session, school_id, row.id)

    @staticmethod
    async def respond(
        session: AsyncSession,
        school_id: UUID | str,
        appointment_id: UUID | str,
        payload: AppointmentRespond,
        *,
        actor_staff_id: UUID | str,
        actor_role: str,
    ) -> tuple[Appointment, Guardian, Student, Staff]:
        row, guardian, student, teacher = await AppointmentsService.get(
            session, school_id, appointment_id
        )

        # Only the addressed teacher (or Admin) can respond.
        if actor_role != ADMIN and str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("You can only respond to appointments addressed to you.")
        if row.status != PENDING:
            raise ConflictError("This appointment has already been actioned.")

        response = (payload.response or "").strip() or None
        decision: Decision = payload.decision
        if decision == DECLINE and not response:
            raise ValidationError("Add a reason when declining.")

        now = _now()
        row.status = CONFIRMED if decision == CONFIRM else DECLINED
        row.teacher_response = response
        row.responded_at = now
        row.updated_at = now
        await session.flush()

        # Notify the guardian.
        guardian_user = await NotificationsService.find_user_for_linked(
            session, school_id, row.guardian_id
        )
        if guardian_user is not None:
            # Past-tense verb for the notification body — coincidentally
            # spelled the same as the terminal status the row just moved
            # into, so we reuse the status constants rather than a
            # parallel set of display strings.
            action = CONFIRMED if decision == CONFIRM else DECLINED
            teacher_name = f"{teacher.first_name} {teacher.last_name}"
            body = f"{teacher_name} {action} your meeting about {student.first_name}."
            if response:
                body += f' "{response}"'
            await NotificationsService.notify_audience(
                session,
                school_id,
                UserAudience(user_id=guardian_user.id),
                NotifyPayload(
                    kind=APPOINTMENT_DECIDED,
                    title=f"Appointment {action}",
                    body=body,
                    link="/parent/appointments",
                ),
            )
            await _notify_appointment_channels(
                session,
                school_id,
                recipient_user=guardian_user,
                recipient_phone=guardian.phone,
                recipient_guardian_id=guardian.id,
                direction="decided",
                email_event="email/appointment-decided.requested",
                email_data={
                    "guardian_email": guardian_user.email,
                    "teacher_name": teacher_name,
                    "student_name": student.first_name,
                    "action": action,
                    "response": response or "",
                    "link": "/parent/appointments",
                },
                sms_body=(
                    f"{teacher_name} {action} your meeting about {student.first_name}. "
                    "Check UHAS SMS for details."
                ),
            )

        return await AppointmentsService.get(session, school_id, appointment_id)

    @staticmethod
    async def cancel(
        session: AsyncSession,
        school_id: UUID | str,
        appointment_id: UUID | str,
        *,
        actor_guardian_id: UUID | str,
    ) -> None:
        row, guardian, student, teacher = await AppointmentsService.get(
            session, school_id, appointment_id
        )
        if str(row.guardian_id) != str(actor_guardian_id):
            raise ForbiddenError("You can only cancel your own requests.")
        if row.status in {DECLINED, CANCELLED}:
            raise ConflictError("This appointment is already closed.")

        row.status = CANCELLED
        row.updated_at = _now()
        await session.flush()

        # Notify the teacher — previously nothing told them a request on
        # their calendar had been withdrawn.
        teacher_user = await NotificationsService.find_user_for_linked(
            session, school_id, row.teacher_id
        )
        if teacher_user is not None:
            guardian_name = f"{guardian.first_name} {guardian.last_name}"
            await NotificationsService.notify_audience(
                session,
                school_id,
                UserAudience(user_id=teacher_user.id),
                NotifyPayload(
                    kind=APPOINTMENT_CANCELLED,
                    title="Appointment cancelled",
                    body=f"{guardian_name} cancelled the meeting about {student.first_name}.",
                    link="/teacher/appointments",
                ),
            )
            await _notify_appointment_channels(
                session,
                school_id,
                recipient_user=teacher_user,
                recipient_phone=teacher.phone,
                recipient_guardian_id=None,
                direction="activity",
                email_event="email/appointment-cancelled.requested",
                email_data={
                    "teacher_email": teacher_user.email,
                    "teacher_name": f"{teacher.first_name} {teacher.last_name}",
                    "guardian_name": guardian_name,
                    "student_name": student.first_name,
                    "link": "/teacher/appointments",
                },
                sms_body=(f"{guardian_name} cancelled the meeting about {student.first_name}."),
            )
