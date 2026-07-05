"""Compose the caller's `SessionUser` shape from three DB reads + JWT claims.

Called only from `GET /me`. Kept out of `router.py` so the assembly
logic is unit-testable without hitting FastAPI.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.core.roles import PARENT
from app.core.school_structure import Division
from app.core.security import CurrentUser
from app.features.guardians.model import Guardian
from app.features.me.schema import MeRead, MeUpdate
from app.features.staff.model import Staff
from app.features.users.model import User
from app.features.users.repository import UsersRepository
from app.features.users.supabase_admin import SupabaseAdminClient


class MeService:
    """Resolve the caller's rich session profile."""

    @staticmethod
    async def get(session: AsyncSession, user: CurrentUser) -> MeRead:
        """Return the composite `MeRead` for the current JWT holder.

        Reads:
          - `users` bridge row for `is_active` + fallback email
          - Linked `staff` row (non-Parent) for display_name, slug,
            + Teacher unit-head fields
          - Linked `guardians` row (Parent) for display_name + slug

        Falls back to email → phone for `display_name` when the linked
        row is missing — happens briefly during account provisioning
        or if an admin deletes the linked record without deactivating
        the auth user.

        Raises `ForbiddenError` if the JWT lacks role/school_id/uid —
        the session is malformed and no dashboard is safe to render.
        """
        if not user.role or not user.school_id:
            raise ForbiddenError("Session is missing role or school scope.")

        user_row = await session.scalar(select(User).where(User.id == UUID(user.user_id)))
        if user_row is None:
            raise ForbiddenError("Session has no matching user row.")

        display_name = ""
        slug: str | None = None
        phone: str | None = None
        is_unit_head = False
        unit_head_of: Division | None = None

        if user.linked_id:
            linked_uuid = UUID(user.linked_id)
            if user.role == PARENT:
                guardian = await session.scalar(select(Guardian).where(Guardian.id == linked_uuid))
                if guardian is not None:
                    display_name = f"{guardian.first_name} {guardian.last_name}"
                    slug = guardian.slug
                    phone = guardian.phone
            else:
                staff = await session.scalar(select(Staff).where(Staff.id == linked_uuid))
                if staff is not None:
                    display_name = f"{staff.first_name} {staff.last_name}"
                    slug = staff.slug
                    phone = staff.phone
                    if bool(staff.is_unit_head):
                        is_unit_head = True
                        unit_head_of = staff.unit_head_of  # type: ignore[assignment]

        if not display_name:
            display_name = user.email or user.phone or ""

        return MeRead(
            uid=UUID(user.user_id),
            email=user.email or user_row.email or "",
            display_name=display_name,
            role=user.role,
            linked_id=user_row.linked_id,
            slug=slug,
            phone=phone,
            must_change_password=user.must_change_password,
            is_active=bool(user_row.is_active) if user_row.is_active is not None else True,
            is_unit_head=is_unit_head,
            unit_head_of=unit_head_of,
        )

    @staticmethod
    async def update(
        session: AsyncSession,
        user: CurrentUser,
        payload: MeUpdate,
        *,
        supabase: SupabaseAdminClient,
    ) -> MeRead:
        """Self-service update of the caller's own display name + phone.

        Writes to the linked `staff`/`guardians` row directly — there's
        no separate "users" row to update here (unlike the admin-side
        `UsersService.update`, which patches a bridge-table row this
        one skips entirely since the caller IS the row's owner).
        """
        if not user.school_id or not user.linked_id:
            raise ValidationError("No linked staff or guardian record to update.")

        changes = payload.model_dump(exclude_unset=True)
        linked_uuid = UUID(user.linked_id)

        display_name = changes.get("display_name")
        phone = changes.get("phone")

        if user.role == PARENT:
            guardian = await UsersRepository.find_guardian_in_school(
                session, user.school_id, linked_uuid
            )
            if guardian is None:
                raise ForbiddenError("Linked guardian record not found.")
            if display_name is not None:
                first, _, last = display_name.partition(" ")
                guardian.first_name = first
                guardian.last_name = last
            if phone is not None:
                guardian.phone = phone
        else:
            staff = await UsersRepository.find_staff_in_school(session, user.school_id, linked_uuid)
            if staff is None:
                raise ForbiddenError("Linked staff record not found.")
            if display_name is not None:
                first, _, last = display_name.partition(" ")
                staff.first_name = first
                staff.last_name = last
            if phone is not None:
                staff.phone = phone

        if display_name is not None:
            await supabase.update_user_by_id(
                UUID(user.user_id), user_metadata={"display_name": display_name}
            )

        try:
            await session.flush()
        except IntegrityError as exc:
            # Roll back here rather than trusting the caller's cleanup —
            # a failed flush leaves the session's transaction unusable
            # for any further query (including the GET below) until
            # it's reset.
            await session.rollback()
            raise ConflictError("That phone number is already in use.") from exc

        return await MeService.get(session, user)
