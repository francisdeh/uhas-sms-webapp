"""Business logic for Announcements.

Two orthogonal concerns:

  1. Create-time role gates
     * `all` audience — Admin only.
     * `division:X` — Admin, or DeputyHead whose own division is X.
     * `class:X` — Admin only. Teachers do NOT get to send a
       class-scoped notification (matches TS; class comms happen via
       assignments + attendance).

  2. List-time visibility per role
     * Admin — everything.
     * DeputyHead — `all` + `division:<own division>`.
     * Teacher — `all` + `division:<own division>` + anything without a
       recognised prefix (defensive, matches TS).
     * Parent — `all` + `division:<any of their children's divisions>`
       + `class:<any of their children's classes>`.

Post creates a notification fan-out gated by
`school.notification_defaults.on_announcement_posted`:
  * `all` → `SchoolWide`
  * `division` → `StaffByDivision` + `ParentsInDivision`
  * `class` → `ParentsOfClass`
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.core.roles import ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.features.announcements.audience import (
    AllAudience,
    ClassAudience,
    DivisionAudience,
    ParsedAudience,
    parse_audience,
)
from app.features.announcements.model import Announcement
from app.features.announcements.repository import AnnouncementsRepository
from app.features.announcements.schema import AnnouncementCreate
from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.notifications.audience import (
    ParentsInDivisionAudience,
    ParentsOfClassAudience,
    SchoolWideAudience,
    StaffByDivisionAudience,
)
from app.features.notifications.constants import ANNOUNCEMENT_POSTED
from app.features.notifications.service import NotificationsService, NotifyPayload
from app.features.schools.model import School
from app.features.schools.service import SchoolsService
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.students.model import StudentGuardian


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ─── Parent landing link ────────────────────────────────────────────────────
# Best-effort deep link on the notification. The parent path works for
# the largest audience; staff can still find the announcement from their
# own list.
_ANNOUNCEMENT_LANDING_LINK = "/parent/announcements"


class AnnouncementsService:
    @staticmethod
    async def get(
        session: AsyncSession,
        school_id: UUID | str,
        announcement_id: UUID | str,
    ) -> tuple[Announcement, Staff]:
        row = await AnnouncementsRepository.get_by_id(session, school_id, announcement_id)
        if not row:
            raise NotFoundError(f"Announcement {announcement_id!r} not found.")
        return row

    @staticmethod
    async def list_visible_to(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        actor_role: str,
        actor_linked_id: UUID | str | None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[tuple[Announcement, Staff]], int]:
        """Fetches the school's announcements, then filters per-role.

        The filter needs the caller's own division (for staff) or their
        children's divisions/classes (for parents); those lookups are
        done here so the repository stays generic.
        """
        rows, total = await AnnouncementsRepository.list_for_school(
            session, school_id, page=page, size=size
        )

        if actor_role == ADMIN:
            return rows, total

        if actor_role in {DEPUTY_HEAD, TEACHER}:
            staff = (
                await StaffRepository.get_by_id(session, school_id, actor_linked_id)
                if actor_linked_id
                else None
            )
            staff_division = staff.division if staff else None
            filtered = [(a, s) for (a, s) in rows if _staff_can_see(a, staff_division, actor_role)]
            return filtered, len(filtered)

        if actor_role == PARENT and actor_linked_id:
            divisions, class_ids = await _parent_scope(session, school_id, actor_linked_id)
            filtered = [(a, s) for (a, s) in rows if _parent_can_see(a, divisions, class_ids)]
            return filtered, len(filtered)

        # Any other role (Accountant, or a role we haven't seen)
        # sees only school-wide announcements. Conservative default.
        filtered = [(a, s) for (a, s) in rows if _is_all(a.audience)]
        return filtered, len(filtered)

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: AnnouncementCreate,
        *,
        author_staff_id: UUID | str,
        actor_role: str,
    ) -> tuple[Announcement, Staff]:
        parsed = parse_audience(payload.audience)
        author = await StaffRepository.get_by_id(session, school_id, author_staff_id)
        if not author:
            raise NotFoundError("Author not found.")

        _assert_can_post(parsed, actor_role=actor_role, author_division=author.division)

        row = Announcement(
            school_id=school_id,
            title=payload.title,
            body=payload.body,
            audience=payload.audience,
            is_critical=payload.is_critical,
            created_by_id=author.id,
        )
        session.add(row)
        await session.flush()

        # Fan out an in-app notification to the resolved audience — gated
        # by the school's per-kind default so admins can quiet the
        # system when needed.
        school = await SchoolsService.get(session, school_id)
        if _on_announcement_posted_enabled(school):
            await _fan_out_notification(
                session,
                school_id,
                parsed,
                title=payload.title,
                body=payload.body,
                is_critical=payload.is_critical,
            )

        return await AnnouncementsService.get(session, school_id, row.id)

    @staticmethod
    async def delete(
        session: AsyncSession,
        school_id: UUID | str,
        announcement_id: UUID | str,
        *,
        actor_staff_id: UUID | str,
        actor_role: str,
    ) -> None:
        row, _author = await AnnouncementsService.get(session, school_id, announcement_id)
        is_owner = str(row.created_by_id) == str(actor_staff_id)
        if not is_owner and actor_role != ADMIN:
            raise ForbiddenError("You can only delete your own announcements.")
        await session.delete(row)
        await session.flush()


# ─── Role-gate helpers ──────────────────────────────────────────────────────


def _assert_can_post(
    parsed: ParsedAudience,
    *,
    actor_role: str,
    author_division: str | None,
) -> None:
    """Mirror of the TS `createAnnouncementAction` role-gate ladder."""
    if isinstance(parsed, AllAudience):
        if actor_role != ADMIN:
            raise ConflictError("Only Admin can post school-wide announcements.")
        return

    if isinstance(parsed, DivisionAudience):
        if actor_role == ADMIN:
            return
        if actor_role == DEPUTY_HEAD:
            if author_division != parsed.division:
                raise ConflictError("You can only post to your own division.")
            return
        raise ConflictError("You are not allowed to post division announcements.")

    if isinstance(parsed, ClassAudience) and actor_role != ADMIN:
        raise ConflictError("Only Admin can target a specific class.")


def _staff_can_see(announcement: Announcement, staff_division: str | None, role: str) -> bool:
    parsed = parse_audience(announcement.audience)
    if isinstance(parsed, AllAudience):
        return True
    if isinstance(parsed, DivisionAudience):
        return staff_division == parsed.division
    # Class-scoped: TS shows these to teachers too (defensively). Deputies
    # see only their division; teachers see class-scoped announcements
    # for their assigned classes — but the current TS behaviour is
    # "teacher sees anything with an unknown/class prefix" — mirror that
    # rather than adding a class-teacher lookup here.
    return role == TEACHER and isinstance(parsed, ClassAudience)


def _parent_can_see(announcement: Announcement, divisions: set[str], class_ids: set[str]) -> bool:
    parsed = parse_audience(announcement.audience)
    if isinstance(parsed, AllAudience):
        return True
    if isinstance(parsed, DivisionAudience):
        return parsed.division in divisions
    if isinstance(parsed, ClassAudience):
        return parsed.class_id in class_ids
    return False


def _is_all(audience: str) -> bool:
    return isinstance(parse_audience(audience), AllAudience)


# ─── Parent scope lookup (divisions + classes their kids attend) ────────────


async def _parent_scope(
    session: AsyncSession,
    school_id: UUID | str,
    guardian_id: UUID | str,
) -> tuple[set[str], set[str]]:
    """Returns (divisions, class_ids) covering every active enrollment
    for the parent's linked children.

    Used only by the parent-visibility filter; other roles skip this
    entirely so the join cost isn't paid on every list."""
    school = await SchoolsService.get(session, school_id)

    # Guardian → child student IDs.
    child_ids = list(
        (
            await session.execute(
                select(StudentGuardian.student_id).where(StudentGuardian.guardian_id == guardian_id)
            )
        ).scalars()
    )
    if not child_ids:
        return set(), set()

    # Active enrollments → classes → (division, class_id) pairs.
    rows = (
        await session.execute(
            select(Class.id, Class.division)
            .join(Enrollment, Enrollment.class_id == Class.id)
            .where(
                and_(
                    Enrollment.student_id.in_(child_ids),
                    Enrollment.academic_year == school.academic_year,
                    Enrollment.status == ENROLLMENT_ACTIVE,
                )
            )
        )
    ).all()
    divisions = {row[1] for row in rows}
    class_ids = {str(row[0]) for row in rows}
    return divisions, class_ids


# ─── Notification fan-out ───────────────────────────────────────────────────


def _on_announcement_posted_enabled(school: School) -> bool:
    """Reads `school.notification_defaults.on_announcement_posted` if
    the column is populated. When absent (fresh schools), the default
    is `True` — matches the TS behaviour where the field is required."""
    defaults = school.notification_defaults or {}
    return bool(defaults.get("on_announcement_posted", True))


async def _fan_out_notification(
    session: AsyncSession,
    school_id: UUID | str,
    parsed: ParsedAudience,
    *,
    title: str,
    body: str,
    is_critical: bool,
) -> None:
    display_title = f"⚠ {title}" if is_critical else title
    preview_body = body if len(body) <= 140 else body[:137] + "..."
    payload = NotifyPayload(
        kind=ANNOUNCEMENT_POSTED,
        title=display_title,
        body=preview_body,
        link=_ANNOUNCEMENT_LANDING_LINK,
    )

    if isinstance(parsed, AllAudience):
        await NotificationsService.notify_audience(
            session, school_id, SchoolWideAudience(), payload
        )
    elif isinstance(parsed, DivisionAudience):
        # Staff in the division + parents of students in the division.
        await NotificationsService.notify_audience(
            session,
            school_id,
            StaffByDivisionAudience(division=parsed.division),
            payload,
        )
        await NotificationsService.notify_audience(
            session,
            school_id,
            ParentsInDivisionAudience(division=parsed.division),
            payload,
        )
    elif isinstance(parsed, ClassAudience):
        await NotificationsService.notify_audience(
            session,
            school_id,
            ParentsOfClassAudience(class_id=parsed.class_id),
            payload,
        )
