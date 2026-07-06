"""Business logic for admin user management.

Composes the Supabase Admin API + the local `users` bridge table so
each endpoint corresponds to one high-level admin action:

  - create → Supabase createUser + insert bridge row
  - update → email/display_name on both sides, DB record + linked
    staff/guardian name if present
  - deactivate/activate → toggle `users.is_active` and set
    Supabase `ban_duration` accordingly

`linked_id` is validated per role — Parents point at `guardians`, all
other roles at `staff` — because the frontend routes reads through the
same convention.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFoundError, ValidationError
from app.core.roles import PARENT
from app.features.audit.actions import AuditAction
from app.features.audit.service import write_audit_log
from app.features.users.model import User
from app.features.users.repository import JoinedRow, UsersRepository
from app.features.users.schema import UserCreate, UserRead, UserUpdate
from app.features.users.supabase_admin import PERMANENT_BAN, SupabaseAdminClient


def _invite_redirect_url() -> str:
    return f"{settings.app_url}/change-password"


def _display_name_from_joined(
    staff_first: str | None,
    staff_last: str | None,
    guardian_first: str | None,
    guardian_last: str | None,
) -> str:
    first = staff_first or guardian_first or ""
    last = staff_last or guardian_last or ""
    if not first and not last:
        return ""
    return f"{first} {last}".strip()


def _row_to_read(joined: JoinedRow) -> UserRead:
    row, staff_first, staff_last, guardian_first, guardian_last, staff_slug, guardian_slug = joined
    return UserRead(
        id=row.id,
        email=row.email,
        role=row.role,
        linked_id=row.linked_id,
        slug=staff_slug or guardian_slug,
        display_name=_display_name_from_joined(
            staff_first, staff_last, guardian_first, guardian_last
        ),
        is_active=True if row.is_active is None else bool(row.is_active),
        must_change_password=(
            True if row.must_change_password is None else bool(row.must_change_password)
        ),
    )


class UsersService:
    @staticmethod
    async def list_for_school(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        q: str | None,
        page: int,
        size: int,
    ) -> tuple[list[UserRead], int]:
        rows, total = await UsersRepository.list_for_school(
            session, school_id, q=q, page=page, size=size
        )
        return [_row_to_read(row) for row in rows], total

    @staticmethod
    async def _get_or_404(session: AsyncSession, school_id: UUID | str, user_id: UUID) -> User:
        row = await UsersRepository.get_by_id(session, school_id, user_id)
        if not row:
            raise NotFoundError(f"User {user_id!r} not found.")
        return row

    @staticmethod
    async def _read_or_404(session: AsyncSession, school_id: UUID | str, user_id: UUID) -> UserRead:
        joined = await UsersRepository.get_joined_by_id(session, school_id, user_id)
        if joined is None:
            raise NotFoundError(f"User {user_id!r} not found.")
        return _row_to_read(joined)

    @staticmethod
    async def _validate_link(
        session: AsyncSession,
        school_id: UUID | str,
        role: str,
        linked_id: UUID | None,
    ) -> None:
        if linked_id is None:
            return
        if role == PARENT:
            guardian = await UsersRepository.find_guardian_in_school(session, school_id, linked_id)
            if guardian is None:
                raise ValidationError(
                    "linked_id must reference a guardian in this school for the Parent role.",
                )
        else:
            staff = await UsersRepository.find_staff_in_school(session, school_id, linked_id)
            if staff is None:
                raise ValidationError(
                    "linked_id must reference a staff member in this school for this role.",
                )

    @staticmethod
    async def create(
        session: AsyncSession,
        school_id: UUID | str,
        payload: UserCreate,
        *,
        supabase: SupabaseAdminClient,
    ) -> UserRead:
        await UsersService._validate_link(session, school_id, payload.role, payload.linked_id)

        redirect_to = _invite_redirect_url()
        created = await supabase.invite_user_by_email(email=payload.email, redirect_to=redirect_to)
        auth_uid = UUID(str(created["id"]))
        await supabase.update_user_by_id(
            auth_uid,
            app_metadata={
                "role": payload.role,
                "school_id": str(school_id),
                "linked_id": str(payload.linked_id) if payload.linked_id else None,
            },
            user_metadata={
                "display_name": payload.display_name,
                "must_change_password": True,
            },
        )
        school_uuid = school_id if isinstance(school_id, UUID) else UUID(str(school_id))
        row = User(
            id=auth_uid,
            school_id=school_uuid,
            email=payload.email,
            role=payload.role,
            linked_id=payload.linked_id,
            is_active=True,
            must_change_password=True,
        )
        await UsersRepository.insert(session, row)
        return await UsersService._read_or_404(session, school_id, auth_uid)

    @staticmethod
    async def update(
        session: AsyncSession,
        school_id: UUID | str,
        user_id: UUID,
        payload: UserUpdate,
        *,
        supabase: SupabaseAdminClient,
    ) -> UserRead:
        row = await UsersService._get_or_404(session, school_id, user_id)
        changes = payload.model_dump(exclude_unset=True)

        supabase_kwargs: dict[str, Any] = {}
        if "email" in changes and changes["email"] is not None:
            row.email = changes["email"]
            supabase_kwargs["email"] = changes["email"]

        display_name = changes.get("display_name")
        if display_name is not None:
            await UsersService._apply_display_name(session, school_id, row, display_name)
            supabase_kwargs["user_metadata"] = {"display_name": display_name}

        if supabase_kwargs:
            await supabase.update_user_by_id(row.id, **supabase_kwargs)
        await session.flush()
        return await UsersService._read_or_404(session, school_id, user_id)

    @staticmethod
    async def _apply_display_name(
        session: AsyncSession,
        school_id: UUID | str,
        row: User,
        display_name: str,
    ) -> None:
        if row.linked_id is None:
            return
        first, _, last = display_name.partition(" ")
        if row.role == PARENT:
            guardian = await UsersRepository.find_guardian_in_school(
                session, school_id, row.linked_id
            )
            if guardian is not None:
                guardian.first_name = first
                guardian.last_name = last
        else:
            staff = await UsersRepository.find_staff_in_school(session, school_id, row.linked_id)
            if staff is not None:
                staff.first_name = first
                staff.last_name = last

    @staticmethod
    async def set_active(
        session: AsyncSession,
        school_id: UUID | str,
        user_id: UUID,
        *,
        active: bool,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
        action: AuditAction,
    ) -> UserRead:
        """Flip `users.is_active` + set the matching Supabase ban, then
        audit-log it. Shared by the admin activate/deactivate endpoints
        and the self-service `POST /me/deactivate` — the caller supplies
        the `action` (who initiated) and `actor_user_id`.

        The Supabase ban is the real enforcement — nothing in the app
        consults `is_active` on its own — so both must move together.
        """
        row = await UsersService._get_or_404(session, school_id, user_id)
        before = row.is_active
        await supabase.update_user_by_id(
            row.id,
            ban_duration="none" if active else PERMANENT_BAN,
        )
        row.is_active = active
        await session.flush()
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=action,
            target_table="users",
            target_id=user_id,
            before={"isActive": before},
            after={"isActive": active},
        )
        return await UsersService._read_or_404(session, school_id, user_id)
