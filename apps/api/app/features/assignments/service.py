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

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.features.assignments.constants import DRAFT, PUBLISHED
from app.features.assignments.model import Assignment
from app.features.assignments.repository import AssignmentsRepository
from app.features.assignments.schema import AssignmentCreate, AssignmentUpdate
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.notifications.audience import ParentsOfClassAudience
from app.features.notifications.constants import ASSIGNMENT_CREATED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


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
        await NotificationsService.notify_audience(
            session,
            school_id,
            ParentsOfClassAudience(class_id=row.class_id),
            NotifyPayload(
                kind=ASSIGNMENT_CREATED,
                title="New assignment",
                body=f"{row.title} ({cls.name}).{due_note}",
                link="/parent/assignments",
            ),
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
