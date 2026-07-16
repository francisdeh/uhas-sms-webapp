"""Business logic for Assignments.

The lightest domain in the port. State machine:

    draft ──publish──► published ──unpublish──► draft

Ownership: only the owning teacher (Assignment.teacher_id) can create /
edit / publish / unpublish / delete. Admin/DeputyHead read is unrestricted;
they don't get to mutate on behalf of a teacher (mirrors TS behaviour —
override is intentionally out of scope).

Soft-delete via `deleted_at` matches the pattern used by lesson_plans
and schemes; the row stays for the eventual admin Trash UI.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.features.assignments.constants import DRAFT, PUBLISHED
from app.features.assignments.model import Assignment
from app.features.assignments.repository import AssignmentsRepository
from app.features.assignments.schema import AssignmentCreate, AssignmentUpdate
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.notifications.constants import ASSIGNMENT_CREATED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository
from app.features.users.model import User, UserPreferences

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _notify_assignment_created(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    class_id: UUID | str,
    class_name: str,
    title: str,
    due_note: str,
) -> None:
    """Fans out `ASSIGNMENT_CREATED` to every primary guardian of an
    actively-enrolled student in `class_id` this academic year. One
    in-app notification + one email + one SMS per guardian — same
    shape as `attendance._notify_attendance_absences`, minus the
    per-child batching (every recipient here shares the same single
    assignment, not "however many of their children were marked
    absent").
    """
    school = await SchoolsRepository.get_by_id(session, school_id)
    defaults = (school.notification_defaults if school else None) or {}
    if not defaults.get("on_assignment_created", True):
        return

    academic_year = school.academic_year if school else None
    if not academic_year:
        return

    recipients = await AssignmentsRepository.list_primary_guardians_for_class(
        session, school_id, class_id, academic_year=academic_year
    )
    if not recipients:
        return

    by_guardian: dict[UUID, tuple[User, UUID, str | None]] = {}
    for _student, guardian, user in recipients:
        if user is None:
            continue
        by_guardian[user.id] = (user, guardian.id, guardian.phone)

    school_name = school.name if school else "UHAS SMS"
    school_address = (school.address if school else None) or ""
    school_contact_email = (school.email if school else None) or ""
    body = f"{title} ({class_name}).{due_note}"

    for user, guardian_id, phone in by_guardian.values():
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=user.id,
            payload=NotifyPayload(
                kind=ASSIGNMENT_CREATED,
                title="New assignment",
                body=body,
                link="/parent/assignments",
            ),
        )

        prefs = await session.scalar(
            select(UserPreferences).where(UserPreferences.user_id == user.id)
        )
        email_allowed = getattr(prefs, "email_on_assignment_created", True) if prefs else True
        sms_allowed = getattr(prefs, "sms_on_assignment_created", True) if prefs else True

        if user.email and email_allowed:
            try:
                await inngest_client.send(
                    inngest.Event(
                        name="email/assignment-created.requested",
                        data={
                            "guardian_email": user.email,
                            "title": title,
                            "class_name": class_name,
                            "due_note": due_note,
                            "link": "/parent/assignments",
                            "school_name": school_name,
                            "school_address": school_address,
                            "school_contact_email": school_contact_email,
                            "preferences_link": "/parent/profile?tab=notifications",
                        },
                    )
                )
            except Exception:
                logger.exception(
                    "Failed to emit email/assignment-created.requested for school %s", school_id
                )
                sentry_sdk.capture_exception()

        if phone and sms_allowed:
            try:
                await inngest_client.send(
                    inngest.Event(
                        name="sms/fanout.requested",
                        data={
                            "school_id": str(school_id),
                            "category": "assignment",
                            "body": f"{body} Check UHAS SMS for details.",
                            "recipients": [{"phone": phone, "guardian_id": str(guardian_id)}],
                        },
                    )
                )
            except Exception:
                logger.exception("Failed to emit assignment SMS fan-out for school %s", school_id)
                sentry_sdk.capture_exception()


class AssignmentsService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        class_id: UUID | str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Assignment, Staff, Subject, Class]], int]:
        return await AssignmentsRepository.list_for_school(
            session,
            school_id,
            teacher_id=teacher_id,
            status=status,
            class_id=class_id,
            page=page,
            size=size,
        )

    @staticmethod
    async def list_published_for_students(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        student_ids: list[UUID | str],
        academic_year: str,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Assignment, Staff, Subject, Class]], int]:
        return await AssignmentsRepository.list_published_for_students(
            session,
            school_id,
            student_ids=student_ids,
            academic_year=academic_year,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class]:
        row = await AssignmentsRepository.get_by_id(session, school_id, assignment_id)
        if not row:
            raise NotFoundError(f"Assignment {assignment_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: AssignmentCreate,
        *,
        teacher_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class]:
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        subject = await SubjectsRepository.get_by_id(session, school_id, payload.subject_id)
        if not subject:
            raise ValidationError("Subject not found in this school.")

        row = Assignment(
            school_id=school_id,
            teacher_id=teacher_id,
            subject_id=payload.subject_id,
            class_id=payload.class_id,
            title=payload.title,
            description=payload.description,
            file_url=payload.file_url,
            due_date=payload.due_date,
            status=DRAFT,
        )
        session.add(row)
        await session.flush()
        return await AssignmentsService.get(session, school_id, row.id)

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
        payload: AssignmentUpdate,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class]:
        row, _t, _s, _c = await AssignmentsService.get(session, school_id, assignment_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("You can only edit your own assignments.")

        patch = payload.model_dump(exclude_unset=True)
        # If class_id is being changed, verify the new class exists in
        # this school — same guard applied on create.
        if "class_id" in patch and patch["class_id"] is not None:
            cls = await ClassesRepository.get_by_id(session, school_id, patch["class_id"])
            if not cls:
                raise ValidationError("Class not found in this school.")
        for field, value in patch.items():
            setattr(row, field, value)
        row.updated_at = _now()
        await session.flush()
        return await AssignmentsService.get(session, school_id, assignment_id)

    @staticmethod
    async def publish(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class]:
        row, _t, _s, cls = await AssignmentsService.get(session, school_id, assignment_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("You can only publish your own assignments.")
        if row.status == PUBLISHED:
            raise ConflictError("Already published.")
        now = _now()
        row.status = PUBLISHED
        row.published_at = now
        row.updated_at = now
        await session.flush()

        # Notify parents of every currently-active student in the class.
        # Empty audience is a silent no-op — the assignment is still
        # published; parents just don't get a push.
        due_note = f" Due {row.due_date:%d %b}." if row.due_date else ""
        await _notify_assignment_created(
            session,
            school_id,
            class_id=row.class_id,
            class_name=cls.name,
            title=row.title,
            due_note=due_note,
        )
        return await AssignmentsService.get(session, school_id, assignment_id)

    @staticmethod
    async def unpublish(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[Assignment, Staff, Subject, Class]:
        row, _t, _s, _c = await AssignmentsService.get(session, school_id, assignment_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("You can only unpublish your own assignments.")
        row.status = DRAFT
        row.published_at = None
        row.updated_at = _now()
        await session.flush()
        return await AssignmentsService.get(session, school_id, assignment_id)

    @staticmethod
    async def soft_delete(
        session: AsyncSession,
        school_id: UUID | str,
        assignment_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> None:
        row, _t, _s, _c = await AssignmentsService.get(session, school_id, assignment_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("You can only delete your own assignments.")
        now = _now()
        row.deleted_at = now
        row.updated_at = now
        await session.flush()
