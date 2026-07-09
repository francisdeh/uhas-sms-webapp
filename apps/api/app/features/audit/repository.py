"""Data-access for reading the audit log.

Writes live in `service.write_audit_log`. This module owns the query
side — filtered pagination + actor-name resolution.

Actor resolution rules (mirroring the TS `getActorNames` helper):

  1. `audit_log.user_id` → `users.id` (the Supabase auth user id).
  2. If `users.linked_id` points at a staff row, use "First Last".
  3. Otherwise fall back to `users.email`.
  4. If no `users` row matches, the actor name is `None` (the FE
     renders it as "Unknown user").
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.staff.model import Staff
from app.features.users.model import User


class AuditRepository:
    @staticmethod
    def _where_clause(
        school_id: UUID | str,
        *,
        action: str | None,
        created_from: datetime | None,
        created_to: datetime | None,
        user_id: UUID | str | None,
        target_table: str | None,
        target_id: UUID | str | None,
    ) -> Any:
        where = [AuditLog.school_id == school_id]
        if action:
            where.append(AuditLog.action == action)
        if created_from is not None:
            where.append(AuditLog.created_at >= created_from)
        if created_to is not None:
            where.append(AuditLog.created_at <= created_to)
        if user_id is not None:
            where.append(AuditLog.user_id == user_id)
        if target_table:
            where.append(AuditLog.target_table == target_table)
        if target_id is not None:
            where.append(AuditLog.target_id == target_id)
        return and_(*where)

    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        action: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        user_id: UUID | str | None = None,
        target_table: str | None = None,
        target_id: UUID | str | None = None,
        page: int = 1,
        size: int = 50,
    ) -> tuple[list[AuditLog], int]:
        """Newest-first filtered page + total count for the paginator.

        Every filter is optional and additive. `created_from`/`created_to`
        are inclusive DateTimes; callers translate their YYYY-MM-DD input
        to the correct time bounds (00:00 → 23:59)."""
        where_clause = AuditRepository._where_clause(
            school_id,
            action=action,
            created_from=created_from,
            created_to=created_to,
            user_id=user_id,
            target_table=target_table,
            target_id=target_id,
        )

        total = int(
            (
                await session.execute(select(func.count(AuditLog.id)).where(where_clause))
            ).scalar_one()
            or 0
        )

        offset = (page - 1) * size
        stmt = (
            select(AuditLog)
            .where(where_clause)
            .order_by(desc(AuditLog.created_at))
            .offset(offset)
            .limit(size)
        )
        rows = list((await session.execute(stmt)).scalars())
        return rows, total

    @staticmethod
    async def list_all_matching(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        action: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        user_id: UUID | str | None = None,
        target_table: str | None = None,
        target_id: UUID | str | None = None,
    ) -> list[AuditLog]:
        """Every matching row, unpaginated — for CSV export. Same filters
        as `list_for_school`, deliberately kept as a separate method
        rather than an unbounded `size` on that one, so the 200-row page
        cap can't be bypassed by accident from the list endpoint."""
        where_clause = AuditRepository._where_clause(
            school_id,
            action=action,
            created_from=created_from,
            created_to=created_to,
            user_id=user_id,
            target_table=target_table,
            target_id=target_id,
        )
        stmt = select(AuditLog).where(where_clause).order_by(desc(AuditLog.created_at))
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def list_distinct_actor_ids(session: AsyncSession, school_id: UUID | str) -> list[UUID]:
        """Every `user_id` that has ever appeared in this school's audit
        log — the actor-filter dropdown's option set, so it only ever
        shows people who've actually done something (not every staff/
        guardian in the directory)."""
        stmt = select(AuditLog.user_id).where(AuditLog.school_id == school_id).distinct()
        return list((await session.execute(stmt)).scalars())

    @staticmethod
    async def resolve_actor_names(
        session: AsyncSession,
        user_ids: Iterable[UUID | str],
    ) -> dict[str, str]:
        """Returns `{user_id_str: display_name}` — never raises.

        One trip for users + one for the linked staff rows. Users
        without a linked staff row fall back to their email; users that
        don't exist at all are omitted from the map (the caller
        surfaces those as `actor_name=None`)."""
        ids = [str(u) for u in user_ids]
        if not ids:
            return {}
        users_stmt = select(User).where(User.id.in_(ids))
        users = list((await session.execute(users_stmt)).scalars())
        if not users:
            return {}

        staff_ids = [u.linked_id for u in users if u.linked_id is not None]
        staff_by_id: dict[str, Staff] = {}
        if staff_ids:
            staff_stmt = select(Staff).where(Staff.id.in_(staff_ids))
            staff_by_id = {str(s.id): s for s in (await session.execute(staff_stmt)).scalars()}

        out: dict[str, str] = {}
        for u in users:
            if u.linked_id and str(u.linked_id) in staff_by_id:
                s = staff_by_id[str(u.linked_id)]
                out[str(u.id)] = f"{s.first_name} {s.last_name}"
            else:
                out[str(u.id)] = u.email or str(u.id)
        return out
