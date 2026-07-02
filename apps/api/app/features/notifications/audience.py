"""Audience specifications + resolver for notification fan-out.

An `AudienceSpec` is a lightweight dataclass — one shape per audience
kind. Producer domains build one locally and pass it to
`NotificationsService.notify_audience(...)`; the resolver turns it into
a deduped list of active `users.id` values, ready for bulk insert.

Kept as dataclasses (not Pydantic) because these never cross the wire:
they're an internal Python-only interface between producer services and
the notifications delivery layer.

Kinds and their business meaning:

  * `UserAudience(user_id)`                     — one specific user
  * `UsersAudience(user_ids=[...])`             — an ad-hoc set
  * `StaffAudience(staff_id)`                   — the user linked to a
                                                  staff row
  * `StaffByDivisionAudience(division, roles?)` — staff in a division,
                                                  optionally filtered by
                                                  system_role
  * `UnitHeadOfDivisionAudience(division)`      — teachers with
                                                  `unit_head_of=division`
  * `AllTeachersAudience()`                     — every user with
                                                  `role="Teacher"`
  * `AllAdminsAudience()`                       — every user with
                                                  `role="Admin"`
  * `ParentsOfStudentsAudience(student_ids)`    — guardians linked to
                                                  the given students
  * `ParentsOfClassAudience(class_id)`          — parents of every
                                                  currently-active student
                                                  in the class
  * `ParentsInDivisionAudience(division)`       — parents of every
                                                  currently-active student
                                                  in the division
  * `AllParentsAudience()`                      — every user with
                                                  `role="Parent"`
  * `SchoolWideAudience()`                      — every active user in
                                                  the school
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.roles import ADMIN, PARENT, TEACHER
from app.features.classes.model import Class
from app.features.enrollments.constants import ACTIVE as ENROLLMENT_ACTIVE
from app.features.enrollments.model import Enrollment
from app.features.staff.model import Staff
from app.features.students.model import StudentGuardian
from app.features.users.model import User

# ─── Audience specs ─────────────────────────────────────────────────────────


@dataclass(frozen=True)
class UserAudience:
    user_id: UUID | str


@dataclass(frozen=True)
class UsersAudience:
    user_ids: Sequence[UUID | str]


@dataclass(frozen=True)
class StaffAudience:
    staff_id: UUID | str


@dataclass(frozen=True)
class StaffByDivisionAudience:
    division: str
    # If empty, matches every staff row in the division regardless of
    # system_role — that's what the TS side does when `roles` is absent.
    roles: Sequence[str] = field(default_factory=list)


@dataclass(frozen=True)
class UnitHeadOfDivisionAudience:
    division: str


@dataclass(frozen=True)
class AllTeachersAudience:
    pass


@dataclass(frozen=True)
class AllAdminsAudience:
    pass


@dataclass(frozen=True)
class ParentsOfStudentsAudience:
    student_ids: Sequence[UUID | str]


@dataclass(frozen=True)
class ParentsOfClassAudience:
    class_id: UUID | str


@dataclass(frozen=True)
class ParentsInDivisionAudience:
    division: str


@dataclass(frozen=True)
class AllParentsAudience:
    pass


@dataclass(frozen=True)
class SchoolWideAudience:
    pass


AudienceSpec = (
    UserAudience
    | UsersAudience
    | StaffAudience
    | StaffByDivisionAudience
    | UnitHeadOfDivisionAudience
    | AllTeachersAudience
    | AllAdminsAudience
    | ParentsOfStudentsAudience
    | ParentsOfClassAudience
    | ParentsInDivisionAudience
    | AllParentsAudience
    | SchoolWideAudience
)


# ─── Resolver ───────────────────────────────────────────────────────────────


async def resolve_audience(
    session: AsyncSession,
    school_id: UUID | str,
    audience: AudienceSpec,
    *,
    academic_year: str,
) -> list[UUID]:
    """Turn an `AudienceSpec` into a deduped list of active `users.id`s.

    Every path filters by `users.school_id == school_id` and
    `users.is_active == True` so a deactivated user never receives a
    notification. Duplicates are removed with a set pass at the end.

    `academic_year` is only used by the enrollment-driven paths
    (`parents_of_class`, `parents_in_division`) — passed in so the
    resolver stays pure and testable without a `SchoolsService` fetch.
    """
    candidate_ids = await _resolve_candidate_ids(
        session, school_id, audience, academic_year=academic_year
    )
    if not candidate_ids:
        return []
    return await _filter_active_and_dedupe(session, school_id, candidate_ids)


async def _resolve_candidate_ids(
    session: AsyncSession,
    school_id: UUID | str,
    audience: AudienceSpec,
    *,
    academic_year: str,
) -> list[UUID]:
    """Pre-filter dispatch. Returns raw `users.id`s that MAY still be
    inactive; `_filter_active_and_dedupe` finalises the set."""
    match audience:
        case UserAudience(user_id=uid):
            return [_to_uuid(uid)]

        case UsersAudience(user_ids=ids):
            return [_to_uuid(u) for u in ids]

        case StaffAudience(staff_id=sid):
            return await _user_ids_for_linked(session, school_id, [sid])

        case StaffByDivisionAudience(division=div, roles=roles):
            return await _user_ids_for_staff_in_division(session, school_id, div, list(roles))

        case UnitHeadOfDivisionAudience(division=div):
            return await _user_ids_for_unit_heads(session, school_id, div)

        case AllTeachersAudience():
            return await _user_ids_by_role(session, school_id, TEACHER)

        case AllAdminsAudience():
            return await _user_ids_by_role(session, school_id, ADMIN)

        case ParentsOfStudentsAudience(student_ids=sids):
            return await _user_ids_for_guardians_of(session, school_id, list(sids))

        case ParentsOfClassAudience(class_id=cid):
            student_ids = await _student_ids_in_class(session, cid, academic_year=academic_year)
            return await _user_ids_for_guardians_of(session, school_id, student_ids)

        case ParentsInDivisionAudience(division=div):
            student_ids = await _student_ids_in_division(
                session, school_id, div, academic_year=academic_year
            )
            return await _user_ids_for_guardians_of(session, school_id, student_ids)

        case AllParentsAudience():
            return await _user_ids_by_role(session, school_id, PARENT)

        case SchoolWideAudience():
            stmt = select(User.id).where(User.school_id == school_id)
            return list((await session.execute(stmt)).scalars())


# ─── Helpers ────────────────────────────────────────────────────────────────


def _to_uuid(value: UUID | str) -> UUID:
    return value if isinstance(value, UUID) else UUID(str(value))


async def _filter_active_and_dedupe(
    session: AsyncSession, school_id: UUID | str, ids: list[UUID]
) -> list[UUID]:
    """One SELECT that both scopes to the tenant + drops inactive users
    + dedupes in a single pass. Cheaper than N per-id checks and
    matches the pattern the TS side uses (`inArray(users.id, ids)`)."""
    if not ids:
        return []
    stmt = select(User.id).where(
        and_(
            User.school_id == school_id,
            User.is_active.is_(True),
            User.id.in_(ids),
        )
    )
    return list({r for r in (await session.execute(stmt)).scalars()})


async def _user_ids_for_linked(
    session: AsyncSession, school_id: UUID | str, linked_ids: Sequence[UUID | str]
) -> list[UUID]:
    """Given a set of staff or guardian ids, return the users pointing
    at them via `users.linked_id`."""
    ids = [_to_uuid(lid) for lid in linked_ids]
    if not ids:
        return []
    stmt = select(User.id).where(and_(User.school_id == school_id, User.linked_id.in_(ids)))
    return list((await session.execute(stmt)).scalars())


async def _user_ids_for_staff_in_division(
    session: AsyncSession,
    school_id: UUID | str,
    division: str,
    roles: list[str],
) -> list[UUID]:
    where_clauses = [Staff.school_id == school_id, Staff.division == division]
    if roles:
        where_clauses.append(Staff.system_role.in_(roles))
    staff_ids = list(
        (await session.execute(select(Staff.id).where(and_(*where_clauses)))).scalars()
    )
    return await _user_ids_for_linked(session, school_id, staff_ids)


async def _user_ids_for_unit_heads(
    session: AsyncSession, school_id: UUID | str, division: str
) -> list[UUID]:
    staff_ids = list(
        (
            await session.execute(
                select(Staff.id).where(
                    and_(
                        Staff.school_id == school_id,
                        Staff.unit_head_of == division,
                    )
                )
            )
        ).scalars()
    )
    return await _user_ids_for_linked(session, school_id, staff_ids)


async def _user_ids_by_role(session: AsyncSession, school_id: UUID | str, role: str) -> list[UUID]:
    stmt = select(User.id).where(and_(User.school_id == school_id, User.role == role))
    return list((await session.execute(stmt)).scalars())


async def _user_ids_for_guardians_of(
    session: AsyncSession,
    school_id: UUID | str,
    student_ids: list[UUID | str],
) -> list[UUID]:
    if not student_ids:
        return []
    guardian_ids = list(
        (
            await session.execute(
                select(StudentGuardian.guardian_id).where(
                    StudentGuardian.student_id.in_(student_ids)
                )
            )
        ).scalars()
    )
    return await _user_ids_for_linked(session, school_id, guardian_ids)


async def _student_ids_in_class(
    session: AsyncSession,
    class_id: UUID | str,
    *,
    academic_year: str,
) -> list[UUID | str]:
    stmt = select(Enrollment.student_id).where(
        and_(
            Enrollment.class_id == class_id,
            Enrollment.academic_year == academic_year,
            Enrollment.status == ENROLLMENT_ACTIVE,
        )
    )
    return list((await session.execute(stmt)).scalars())


async def _student_ids_in_division(
    session: AsyncSession,
    school_id: UUID | str,
    division: str,
    *,
    academic_year: str,
) -> list[UUID | str]:
    class_ids = list(
        (
            await session.execute(
                select(Class.id).where(
                    and_(
                        Class.school_id == school_id,
                        Class.division == division,
                        Class.academic_year == academic_year,
                    )
                )
            )
        ).scalars()
    )
    if not class_ids:
        return []
    stmt = select(Enrollment.student_id).where(
        and_(
            Enrollment.class_id.in_(class_ids),
            Enrollment.academic_year == academic_year,
            Enrollment.status == ENROLLMENT_ACTIVE,
        )
    )
    return list((await session.execute(stmt)).scalars())
