"""Business logic for Schemes.

Simpler than lesson plans: no rejection, no two-stage review, no draft-
on-edit fallback. Acknowledgement is terminal.

Reviewer authorisation matches lesson-plan Unit Head step:
  Acknowledge: Admin, DeputyHead, OR Teacher with `is_unit_head=True`
  and `unit_head_of == class.division`. Deputy division match enforced.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.roles import ADMIN, DEPUTY_HEAD, TEACHER
from app.features.classes.model import Class
from app.features.classes.repository import ClassesRepository
from app.features.notifications.audience import UnitHeadOfDivisionAudience, resolve_audience
from app.features.notifications.constants import (
    SCHEME_ACKNOWLEDGED,
    SCHEME_COMMENTED,
    SCHEME_SUBMITTED,
    NotificationKind,
)
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schemes.constants import ACKNOWLEDGED, DRAFT, LEARNING, SUBMITTED
from app.features.schemes.model import Scheme, SchemeComment, SchemeWeeklyEntry
from app.features.schemes.repository import SchemesRepository
from app.features.schemes.schema import (
    SchemeAcknowledgeRequest,
    SchemeCreate,
    SchemeUpdate,
    SchemeWeeklyEntryAddRequest,
    SchemeWeeklyEntryUpdateRequest,
)
from app.features.schools.repository import SchoolsRepository
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository
from app.features.users.model import User, UserPreferences

logger = logging.getLogger(__name__)

_SCHEME_LINK = "/teacher/schemes"
_SCHEME_PREFS_LINK = "/teacher/profile?tab=notifications"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def _notify_scheme_channels(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    recipient_user: User,
    recipient_phone: str | None,
    direction: str,
    email_event: str,
    email_data: dict[str, Any],
    sms_body: str,
) -> None:
    """Email + SMS fan-out for a single scheme recipient, on top of the
    in-app notification the caller already writes. `direction` is
    `"activity"` (Unit-Head-facing — submit, teacher comment) or
    `"decided"` (teacher-facing — acknowledge, reviewer comment); it
    selects both the school-level `notification_defaults` toggle and
    the per-user `user_preferences` columns to check. Structurally
    identical to `leave_requests.service._notify_leave_channels`.
    """
    school = await SchoolsRepository.get_by_id(session, school_id)
    if school is None:
        return
    defaults = school.notification_defaults or {}
    if not defaults.get(f"on_scheme_{direction}", True):
        return

    prefs = await session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == recipient_user.id)
    )
    email_allowed = getattr(prefs, f"email_on_scheme_{direction}", True) if prefs else True
    sms_allowed = getattr(prefs, f"sms_on_scheme_{direction}", True) if prefs else True

    if recipient_user.email and email_allowed:
        try:
            await inngest_client.send(
                inngest.Event(
                    name=email_event,
                    data={
                        **email_data,
                        "recipient_email": recipient_user.email,
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or school.email_reply_to or "",
                        "preferences_link": _SCHEME_PREFS_LINK,
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
                        "category": "scheme",
                        "body": sms_body,
                        "recipients": [{"phone": recipient_phone, "guardian_id": None}],
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit scheme SMS fan-out for school %s", school_id)
            sentry_sdk.capture_exception()


async def _notify_scheme_unit_heads(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    academic_year: str,
    division: str,
    kind: NotificationKind,
    title: str,
    body: str,
    email_event: str,
    email_data: dict[str, Any],
) -> None:
    """Fans out to every Unit Head of `division` — in-app + email + SMS,
    direction `"activity"`. Only Unit Heads, no Admin/Deputy-Head
    fallback — mirrors the existing (narrower) in-app-only audience
    this replaces, which already silently notifies nobody for a
    division with no Unit Head; widening that audience is a separate
    decision, out of scope here."""
    user_ids = await resolve_audience(
        session,
        school_id,
        UnitHeadOfDivisionAudience(division=division),
        academic_year=academic_year,
    )
    if not user_ids:
        return

    recipients = (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    linked_ids = [u.linked_id for u in recipients if u.linked_id]
    staff_by_id: dict[UUID, Staff] = {}
    if linked_ids:
        staff_rows = (
            (await session.execute(select(Staff).where(Staff.id.in_(linked_ids)))).scalars().all()
        )
        staff_by_id = {s.id: s for s in staff_rows}

    for user in recipients:
        await NotificationsService.notify_user(
            session,
            school_id,
            user_id=user.id,
            payload=NotifyPayload(kind=kind, title=title, body=body, link=_SCHEME_LINK),
        )
        staff = staff_by_id.get(user.linked_id) if user.linked_id else None
        await _notify_scheme_channels(
            session,
            school_id,
            recipient_user=user,
            recipient_phone=staff.phone if staff else None,
            direction="activity",
            email_event=email_event,
            email_data={**email_data, "link": _SCHEME_LINK},
            sms_body=f"{body} Check UHAS SMS for details.",
        )


async def _notify_scheme_teacher(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    teacher_id: UUID | str,
    kind: NotificationKind,
    title: str,
    body: str,
    email_event: str,
    email_data: dict[str, Any],
) -> None:
    """Notifies the submitting teacher — in-app + email + SMS, direction
    `"decided"`. Single recipient, structurally identical to
    `leave_requests.service._notify_leave_requester`."""
    teacher_user = await NotificationsService.find_user_for_linked(session, school_id, teacher_id)
    if teacher_user is None:
        return

    await NotificationsService.notify_user(
        session,
        school_id,
        user_id=teacher_user.id,
        payload=NotifyPayload(kind=kind, title=title, body=body, link=_SCHEME_LINK),
    )
    teacher_staff = await StaffRepository.get_by_id(session, school_id, teacher_id)
    await _notify_scheme_channels(
        session,
        school_id,
        recipient_user=teacher_user,
        recipient_phone=teacher_staff.phone if teacher_staff else None,
        direction="decided",
        email_event=email_event,
        email_data={**email_data, "link": _SCHEME_LINK},
        sms_body=f"{body} Check UHAS SMS for details.",
    )


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
        if row.type == LEARNING and not row.file_url:
            entry_count = await SchemesRepository.count_weekly_entries(session, row.id)
            if entry_count == 0:
                raise ValidationError(
                    "Add at least one weekly entry or upload a file before submitting."
                )
        row.status = SUBMITTED
        row.submitted_at = _now()
        row.updated_at = _now()
        await session.flush()

        # Notify Unit Heads of the class's division.
        school = await SchoolsRepository.get_by_id(session, school_id)
        if school is not None:
            teacher_name = f"{teacher.first_name} {teacher.last_name}"
            body = f"{teacher_name} submitted {row.title} for {cls.name}."
            await _notify_scheme_unit_heads(
                session,
                school_id,
                academic_year=school.academic_year,
                division=cls.division,
                kind=SCHEME_SUBMITTED,
                title="Scheme submitted",
                body=body,
                email_event="email/scheme-submitted.requested",
                email_data={
                    "teacher_name": teacher_name,
                    "scheme_title": row.title,
                    "class_name": cls.name,
                },
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
        row.reviewed_by_id = actor_staff_id  # type: ignore[assignment]
        row.reviewed_at = _now()
        row.updated_at = _now()
        # The acknowledge note joins the thread (attributed + kept), rather
        # than overwriting a single column.
        if payload.comment and actor_staff_id is not None:
            await SchemesRepository.insert_comment(
                session, scheme_id=row.id, author_id=actor_staff_id, body=payload.comment
            )
        await session.flush()

        # Notify the submitting teacher.
        body = f"{row.title} for {cls.name} was acknowledged" + (
            f": {payload.comment}" if payload.comment else "."
        )
        await _notify_scheme_teacher(
            session,
            school_id,
            teacher_id=row.teacher_id,
            kind=SCHEME_ACKNOWLEDGED,
            title="Scheme acknowledged",
            body=body,
            email_event="email/scheme-acknowledged.requested",
            email_data={
                "scheme_title": row.title,
                "class_name": cls.name,
                "comment": payload.comment or "",
            },
        )
        _ = teacher  # Referenced above for the display fields
        return await SchemesService.get(session, school_id, scheme_id)

    @staticmethod
    async def list_comments(
        session: AsyncSession, scheme_id: UUID | str
    ) -> list[tuple[SchemeComment, Staff]]:
        return await SchemesRepository.list_comments_for_scheme(session, scheme_id)

    @staticmethod
    async def add_comment(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        body: str,
        *,
        actor_staff_id: UUID | str | None,
        actor_role: str,
    ) -> tuple[Scheme, Staff, Subject, Class, Staff | None]:
        """Append a comment to a scheme's thread. Permitted for the scheme's
        author (teacher) or a reviewer (Admin / Deputy of the class's
        division / Unit-Head teacher of that division), once the scheme is
        submitted or acknowledged. Notifies the other side."""
        row, teacher, _sub, cls, _rev = await SchemesService.get(session, school_id, scheme_id)
        if row.status not in (SUBMITTED, ACKNOWLEDGED):
            raise ValidationError("Comments open once a scheme has been submitted.")
        if actor_staff_id is None:
            raise ForbiddenError("You are not allowed to comment on this scheme.")

        is_author = str(row.teacher_id) == str(actor_staff_id)
        if not is_author and not await _is_reviewer(
            session,
            school_id,
            actor_staff_id=actor_staff_id,
            actor_role=actor_role,
            class_division=cls.division,
        ):
            raise ForbiddenError("You are not allowed to comment on this scheme.")

        await SchemesRepository.insert_comment(
            session, scheme_id=row.id, author_id=actor_staff_id, body=body
        )

        if is_author:
            # Teacher replied — nudge the division's Unit Heads.
            teacher_name = f"{teacher.first_name} {teacher.last_name}"
            school = await SchoolsRepository.get_by_id(session, school_id)
            if school is not None:
                await _notify_scheme_unit_heads(
                    session,
                    school_id,
                    academic_year=school.academic_year,
                    division=cls.division,
                    kind=SCHEME_COMMENTED,
                    title="New scheme comment",
                    body=f"{teacher_name} commented on {row.title}.",
                    email_event="email/scheme-commented.requested",
                    email_data={
                        "commenter_name": teacher_name,
                        "scheme_title": row.title,
                        "class_name": cls.name,
                        "comment": body,
                    },
                )
        else:
            # Reviewer commented — nudge the submitting teacher.
            await _notify_scheme_teacher(
                session,
                school_id,
                teacher_id=row.teacher_id,
                kind=SCHEME_COMMENTED,
                title="New scheme comment",
                body=f"A reviewer commented on {row.title} for {cls.name}.",
                email_event="email/scheme-commented.requested",
                email_data={
                    "commenter_name": "A reviewer",
                    "scheme_title": row.title,
                    "class_name": cls.name,
                    "comment": body,
                },
            )
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

    # ── Scheme of Learning weekly entries ───────────────────────────────────

    @staticmethod
    async def list_weekly_entries(
        session: AsyncSession, scheme_id: UUID | str
    ) -> list[SchemeWeeklyEntry]:
        return await SchemesRepository.list_weekly_entries(session, scheme_id)

    @staticmethod
    async def _assert_can_edit_entries(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        actor_staff_id: UUID | str,
    ) -> Scheme:
        row, _t, _s, _c, _r = await SchemesService.get(session, school_id, scheme_id)
        if str(row.teacher_id) != str(actor_staff_id):
            raise ForbiddenError("Only the owning teacher can edit this scheme's weekly entries.")
        if row.status != DRAFT:
            raise ConflictError(f"Cannot edit weekly entries while the scheme is {row.status!r}.")
        if row.type != LEARNING:
            raise ValidationError("Only a Scheme of Learning has weekly entries.")
        return row

    @staticmethod
    async def add_weekly_entry(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        payload: SchemeWeeklyEntryAddRequest,
        *,
        actor_staff_id: UUID | str,
    ) -> list[SchemeWeeklyEntry]:
        row = await SchemesService._assert_can_edit_entries(
            session, school_id, scheme_id, actor_staff_id
        )
        existing = await SchemesRepository.find_weekly_entry_by_week(session, row.id, payload.week)
        if existing is not None:
            raise ConflictError(f"Week {payload.week} already has an entry.")
        entry = SchemeWeeklyEntry(
            scheme_id=row.id,
            week=payload.week,
            strand=payload.strand,
            sub_strand=payload.sub_strand,
            content_standard=payload.content_standard,
            indicators=payload.indicators,
            resources=payload.resources,
            resource_file_urls=payload.resource_file_urls,
        )
        await SchemesRepository.insert_weekly_entry(session, entry)
        return await SchemesRepository.list_weekly_entries(session, row.id)

    @staticmethod
    async def update_weekly_entry(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        entry_id: UUID | str,
        payload: SchemeWeeklyEntryUpdateRequest,
        *,
        actor_staff_id: UUID | str,
    ) -> list[SchemeWeeklyEntry]:
        row = await SchemesService._assert_can_edit_entries(
            session, school_id, scheme_id, actor_staff_id
        )
        entry = await SchemesRepository.get_weekly_entry(session, row.id, entry_id)
        if entry is None:
            raise NotFoundError(f"Weekly entry {entry_id!r} not found.")

        changes = payload.model_dump(exclude_unset=True)
        if "week" in changes and changes["week"] != entry.week:
            existing = await SchemesRepository.find_weekly_entry_by_week(
                session, row.id, changes["week"]
            )
            if existing is not None:
                raise ConflictError(f"Week {changes['week']} already has an entry.")
        for field, value in changes.items():
            setattr(entry, field, value)
        entry.updated_at = _now()
        await session.flush()
        return await SchemesRepository.list_weekly_entries(session, row.id)

    @staticmethod
    async def remove_weekly_entry(
        session: AsyncSession,
        school_id: UUID | str,
        scheme_id: UUID | str,
        entry_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
    ) -> list[SchemeWeeklyEntry]:
        row = await SchemesService._assert_can_edit_entries(
            session, school_id, scheme_id, actor_staff_id
        )
        entry = await SchemesRepository.get_weekly_entry(session, row.id, entry_id)
        if entry is None:
            raise NotFoundError(f"Weekly entry {entry_id!r} not found.")
        await SchemesRepository.delete_weekly_entry(session, entry)
        return await SchemesRepository.list_weekly_entries(session, row.id)


async def _is_reviewer(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    actor_staff_id: UUID | str | None,
    actor_role: str,
    class_division: str,
) -> bool:
    """Whether the actor may review this scheme: Admin (any division),
    Deputy Head of the class's division, or a Unit-Head teacher of it."""
    if actor_role == ADMIN:
        return True
    if actor_role == DEPUTY_HEAD and actor_staff_id:
        staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
        return bool(staff and staff.division == class_division)
    if actor_role == TEACHER and actor_staff_id:
        staff = await StaffRepository.get_by_id(session, school_id, actor_staff_id)
        return bool(staff and staff.is_unit_head and staff.unit_head_of == class_division)
    return False


async def _assert_can_acknowledge(
    session: AsyncSession,
    school_id: UUID | str,
    *,
    actor_staff_id: UUID | str | None,
    actor_role: str,
    class_division: str,
) -> None:
    if await _is_reviewer(
        session,
        school_id,
        actor_staff_id=actor_staff_id,
        actor_role=actor_role,
        class_division=class_division,
    ):
        return
    if actor_role == DEPUTY_HEAD:
        raise ForbiddenError("Deputy Head can only acknowledge schemes in their own division.")
    raise ForbiddenError("Only a Unit Head, Deputy Head, or Admin can acknowledge schemes.")
