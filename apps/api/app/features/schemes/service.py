"""Business logic for Schemes.

Simpler than lesson plans: no rejection, no two-stage review, no draft-
on-edit fallback. Acknowledgement is terminal.

Reviewer authorisation matches lesson-plan Unit Head step:
  Acknowledge: Admin, DeputyHead, OR Teacher with `is_unit_head=True`
  and `unit_head_of == class.division`. Deputy division match enforced.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.notifications.audience import UnitHeadOfDivisionAudience
from app.features.notifications.constants import (
    SCHEME_ACKNOWLEDGED,
    SCHEME_SUBMITTED,
)
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schemes.constants import ACKNOWLEDGED, DRAFT, SUBMITTED
from app.features.schemes.model import Scheme
from app.features.schemes.repository import SchemesRepository
from app.features.schemes.schema import (
    SchemeAcknowledgeRequest,
    SchemeCreate,
    SchemeUpdate,
)
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class SchemesService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        teacher_id: UUID | str | None = None,
        status: str | None = None,
        division: str | None = None,
        term: int | None = None,
        academic_year: str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Scheme, Staff, Subject, Class, Staff | None]], int]:
        return await SchemesRepository.list_for_school(
            session,
            school_id,
            teacher_id=teacher_id,
            status=status,
            division=division,
            term=term,
            academic_year=academic_year,
            page=page,
            size=size,
        )

    @staticmethod
    async def get(
        session: AsyncSession, school_id: UUID | str, scheme_id: UUID | str
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        row = await SchemesRepository.get_by_id(session, school_id, scheme_id)
        if not row:
            raise NotFoundError(f"Scheme {scheme_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: SchemeCreate,
        *,
        teacher_id: UUID | str,
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        cls = await ClassesRepository.get_by_id(session, school_id, payload.class_id)
        if not cls:
            raise ValidationError("Class not found in this school.")
        subject = await SubjectsRepository.get_by_id(session, school_id, payload.subject_id)
        if not subject:
            raise ValidationError("Subject not found in this school.")

        row = Scheme(
            school_id=school_id,
            teacher_id=teacher_id,
            subject_id=payload.subject_id,
            class_id=payload.class_id,
            type=payload.type,
            term=payload.term,
            academic_year=payload.academic_year,
            title=payload.title,
            file_url=payload.file_url,
            content=payload.content,
            status=DRAFT,
        )
        session.add(row)
        await session.flush()
        return await SchemesService.get(session, school_id, row.id)

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        payload: SchemeUpdate,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        row, _t, _s, _c, _r = await SchemesService.get(session, school_id, scheme_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can edit this scheme.")
        if row.status != DRAFT:
            raise ConflictError(f"Cannot edit a scheme in {row.status!r} state.")

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_at = _now()
        await session.flush()
        return await SchemesService.get(session, school_id, scheme_id)

    @staticmethod
    async def submit(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        row, teacher, _s, cls, _r = await SchemesService.get(session, school_id, scheme_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can submit this scheme.")
        if row.status != DRAFT:
            raise ConflictError(f"Cannot submit a scheme in {row.status!r} state.")
        row.status = SUBMITTED
        row.submitted_at = _now()
        row.updated_at = _now()
        await session.flush()

        # Notify Unit Heads of the class's division.
        await NotificationsService.notify_audience(
            session,
            school_id,
            UnitHeadOfDivisionAudience(division=cls.division),
            NotifyPayload(
                kind=SCHEME_SUBMITTED,
                title="Scheme submitted",
                body=(
                    f"{teacher.first_name} {teacher.last_name} submitted "
                    f"{row.title} for {cls.name}."
                ),
                link="/teacher/schemes",
            ),
        )
        return await SchemesService.get(session, school_id, scheme_id)

    @staticmethod
    async def acknowledge(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        payload: SchemeAcknowledgeRequest,
        *,
        actor_staff_id: UUID | str | None,
        actor_role: str,
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        row, teacher, _sub, cls, _rev = await SchemesService.get(session, school_id, scheme_id)
        if row.status != SUBMITTED:
            raise ValidationError(f"Cannot acknowledge a scheme in {row.status!r} state.")

        await _assert_can_acknowledge(
            session,
            school_id,
            actor_staff_id=actor_staff_id,
            actor_role=actor_role,
            class_division=cls.division,
        )

        row.status = ACKNOWLEDGED
        row.reviewer_comment = payload.comment
        row.reviewed_by_id = actor_staff_id  # type: ignore[assignment]
        row.reviewed_at = _now()
        row.updated_at = _now()
        await session.flush()

        # Notify the submitting teacher.
        teacher_user = await NotificationsService.find_user_for_linked(
            session, school_id, row.teacher_id
        )
        if teacher_user is not None:
            await NotificationsService.notify_user(
                session,
                school_id,
                user_id=teacher_user.id,
                payload=NotifyPayload(
                    kind=SCHEME_ACKNOWLEDGED,
                    title="Scheme acknowledged",
                    body=(
                        f"{row.title} for {cls.name} was acknowledged"
                        + (f": {payload.comment}" if payload.comment else ".")
                    ),
                    link="/teacher/schemes",
                ),
            )
            _ = teacher  # Referenced above for the display fields
        return await SchemesService.get(session, school_id, scheme_id)

    @staticmethod
    async def soft_delete(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> None:
        row, _t, _s, _c, _r = await SchemesService.get(session, school_id, scheme_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can delete this scheme.")
        if row.status != DRAFT:
            raise ConflictError(f"Cannot delete a scheme in {row.status!r} state.")
        row.deleted_at = _now()
        await session.flush()


async def _assert_can_acknowledge(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    actor_staff_id: UUID | str | None,
    actor_role: str,
    class_division: str,
) -> None:
    if actor_role == ADMIN:
        return
    if actor_role == DEPUTY_HEAD:
        if actor_staff_id:
            staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
            if staff and staff.division == class_division:
                return
        raise ForbiddenError("Deputy Head can only acknowledge schemes in their own division.")
    if actor_role == TEACHER and actor_staff_id:
        staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
        if staff and staff.is_unit_head and staff.unit_head_of == class_division:
            return
    raise ForbiddenError("Only a Unit Head, Deputy Head, or Admin can acknowledge schemes.")
