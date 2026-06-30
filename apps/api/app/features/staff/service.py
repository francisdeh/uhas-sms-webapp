"""Business logic for the Staff domain.

Encapsulates:
  - slug generation (`STAFF-001` per-school sequence)
  - the "non-Admin roles must declare a division" invariant
  - the "Unit Heads must be Teachers" invariant
  - audit-log writes for role changes (mirrors the legacy
    `ROLE_CHANGE` action so historical entries stay queryable)

Routes never reach into the repository directly — they call services
and let services compose the invariants.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.roles import ADMIN, TEACHER
from app.core.slug import insert_with_sequential_slug, per_school_slug_resolver
from app.features.audit.actions import ROLE_CHANGE
from app.features.audit.service import write_audit_log
from app.features.staff.model import Staff
from app.features.staff.repository import StaffRepository
from app.features.staff.schema import (
    StaffCreate,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
)


class StaffService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None = None,
        page: int = 1,
        size: int = 50,
        active_only: bool = False,
    ) -> tuple[list[Staff], int]:
        """Pass-through paginated list — returns (rows, total)."""
        return await StaffRepository.list_for_school(
            session, school_id, q=q, page=page, size=size, active_only=active_only
        )

    @staticmethod
    async def get(session: AsyncSession, school_id: UUID | str, staff_id: UUID | str) -> Staff:
        """Fetch or raise 404 — never leaks "exists but not yours" vs "doesn't exist"."""
        row = await StaffRepository.get_by_id(session, school_id, staff_id)
        if not row:
            raise NotFoundError(f"Staff member {staff_id!r} not found.")
        return row

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: StaffCreate,
    ) -> Staff:
        """Insert a new staff row with a generated slug.

        Enforces the role/division invariant. Race on slug collision is
        handled by retrying once with the next number.
        """
        if payload.system_role != ADMIN and not payload.division:
            raise ValidationError("Division is required for this role.")

        existing = await StaffRepository.find_by_email(session, school_id, payload.email)
        if existing:
            raise ConflictError("Email already registered.")

        return await insert_with_sequential_slug(
            session,
            next_seq=per_school_slug_resolver(session, school_id, StaffRepository.next_slug_number),
            build_slug=lambda n: f"STAFF-{n:03d}",
            build_row=lambda slug: Staff(
                slug=slug,
                school_id=school_id,
                uhas_id=payload.uhas_id,
                first_name=payload.first_name,
                last_name=payload.last_name,
                rank=payload.rank,
                system_role=payload.system_role,
                division=payload.division,
                is_unit_head=payload.is_unit_head or False,
                unit_head_of=payload.unit_head_of,
                photo_url=payload.photo_url,
                phone=payload.phone,
                email=payload.email,
                is_active=True,
            ),
        )

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffUpdate,
    ) -> Staff:
        """Partial update — only fields present in `payload` are touched."""
        row = await StaffService.get(session, school_id, staff_id)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(row, field, value)
        await session.flush()
        return row

    @staticmethod
    async def change_role(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffRoleChange,
        *,
        actor_user_id: UUID | str,
    ) -> Staff:
        """Apply a role change + clear unit-head flags + audit log.

        Mirrors the legacy `ROLE_CHANGE` action so historical entries
        stay queryable.
        """
        row = await StaffService.get(session, school_id, staff_id)
        if payload.system_role != ADMIN and not payload.division:
            raise ValidationError("Division is required for this role.")

        before_role = row.system_role
        row.system_role = payload.system_role
        row.division = None if payload.system_role == ADMIN else payload.division
        if payload.system_role != TEACHER:
            row.is_unit_head = False
            row.unit_head_of = None

        if before_role != payload.system_role:
            await write_audit_log(
                session,
                school_id=school_id,
                user_id=actor_user_id,
                action=ROLE_CHANGE,
                target_table="staff",
                target_id=staff_id,
                before={"systemRole": before_role},
                after={"systemRole": payload.system_role},
            )
        await session.flush()
        return row

    @staticmethod
    async def toggle_unit_head(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffUnitHeadToggle,
    ) -> Staff:
        """Set/clear the unit-head flag. Only Teachers can be Unit Heads."""
        row = await StaffService.get(session, school_id, staff_id)
        if payload.is_unit_head and row.system_role != TEACHER:
            raise ValidationError("Only teachers can be Unit Heads.")
        if payload.is_unit_head and not payload.unit_head_of:
            raise ValidationError("Pick which unit this staff heads.")
        row.is_unit_head = payload.is_unit_head
        row.unit_head_of = payload.unit_head_of if payload.is_unit_head else None
        await session.flush()
        return row

    @staticmethod
    async def set_active(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        *,
        active: bool,
    ) -> Staff:
        """Deactivate / reactivate — soft delete in effect."""
        row = await StaffService.get(session, school_id, staff_id)
        if row.is_active == active:
            raise ConflictError(f"Staff member is already {'active' if active else 'inactive'}.")
        row.is_active = active
        await session.flush()
        return row
