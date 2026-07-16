"""Resolves contact info (email + phone) for a set of already-resolved
recipient `users.id` values, regardless of whether each one is
staff-linked or guardian-linked.

Every notification-channel PR before Announcements only ever needed
one side of this: `AssignmentsRepository.list_primary_guardians_for_class`
and its siblings resolve guardians only, while
`LeaveRequestsService`/`SchemesService`/`PromotionsService`'s per-domain
helpers resolve staff only. Announcements' `division:X` scope is the
first case that needs BOTH at once (staff in the division + parents of
students in the division, in a single post) — hence a shared resolver
here rather than one more inline join copied into `announcements/service.py`.
"""

from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.guardians.model import Guardian
from app.features.staff.model import Staff
from app.features.users.model import User


@dataclass(frozen=True)
class UserContact:
    user: User
    phone: str | None
    # Set only when `user` is guardian-linked — the shared
    # `sms/fanout.requested` event's `recipients[].guardian_id` field
    # expects this (and `None` for a staff-linked recipient).
    guardian_id: UUID | None


async def resolve_user_contacts(
    session: AsyncSession, user_ids: Collection[UUID | str]
) -> list[UserContact]:
    """One `UserContact` per user id, phone pulled from whichever of
    `Staff`/`Guardian` the user's `linked_id` actually points at. Users
    with no linked row (or no phone on file) get `phone=None` — same
    "missing contact info is not an error" posture as everywhere else
    in this codebase."""
    if not user_ids:
        return []

    users = (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    linked_ids = [u.linked_id for u in users if u.linked_id]
    if not linked_ids:
        return [UserContact(user=u, phone=None, guardian_id=None) for u in users]

    staff_phones: dict[UUID, str | None] = {
        s.id: s.phone
        for s in (await session.execute(select(Staff).where(Staff.id.in_(linked_ids)))).scalars()
    }
    guardian_ids: set[UUID] = set()
    guardian_phones: dict[UUID, str | None] = {}
    for g in (await session.execute(select(Guardian).where(Guardian.id.in_(linked_ids)))).scalars():
        guardian_ids.add(g.id)
        guardian_phones[g.id] = g.phone

    contacts: list[UserContact] = []
    for u in users:
        if u.linked_id in guardian_ids:
            contacts.append(
                UserContact(user=u, phone=guardian_phones.get(u.linked_id), guardian_id=u.linked_id)
            )
        elif u.linked_id in staff_phones:
            contacts.append(
                UserContact(user=u, phone=staff_phones.get(u.linked_id), guardian_id=None)
            )
        else:
            contacts.append(UserContact(user=u, phone=None, guardian_id=None))
    return contacts
