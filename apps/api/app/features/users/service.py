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

import logging
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.inngest import inngest_client
from app.core.roles import PARENT
from app.features.audit.actions import USER_CREATED, USER_MFA_RESET, AuditAction
from app.features.audit.service import write_audit_log
from app.features.schools.service import SchoolsService
from app.features.users.model import User
from app.features.users.repository import JoinedRow, UsersRepository
from app.features.users.schema import UserCreate, UserRead, UserUpdate
from app.features.users.supabase_admin import PERMANENT_BAN, SupabaseAdminClient

logger = logging.getLogger(__name__)


def _invite_redirect_url() -> str:
    return f"{settings.app_url}/change-password"


def _reset_redirect_url() -> str:
    # Same landing page as the invite flow — it establishes a session
    # from Supabase's link token and lets the user set a new password,
    # regardless of whether they arrived via invite or recovery.
    return f"{settings.app_url}/change-password"


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


PASSWORD_RESET_COOLDOWN = timedelta(minutes=5)


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
        actor_user_id: UUID | str,
    ) -> UserRead:
        return await UsersService.provision_login(
            session,
            school_id,
            role=payload.role,
            linked_id=payload.linked_id,
            email=payload.email,
            phone=payload.phone,
            display_name=payload.display_name,
            supabase=supabase,
            actor_user_id=actor_user_id,
        )

    @staticmethod
    async def provision_guardian_login(
        session: AsyncSession,
        school_id: UUID | str,
        guardian_id: UUID,
        *,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> UserRead:
        """Provision a Parent login for a guardian, sourcing the login's
        email/phone from the guardian record itself."""
        guardian = await UsersRepository.find_guardian_in_school(session, school_id, guardian_id)
        if guardian is None:
            raise NotFoundError(f"Guardian {guardian_id!r} not found.")
        return await UsersService.provision_login(
            session,
            school_id,
            role=PARENT,
            linked_id=guardian_id,
            email=guardian.email,
            phone=guardian.phone,
            display_name=f"{guardian.first_name} {guardian.last_name}".strip(),
            supabase=supabase,
            actor_user_id=actor_user_id,
        )

    @staticmethod
    async def provision_staff_login(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID,
        *,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> UserRead:
        """Provision a login for a staff member, inferring `role` from
        the staff row's own `system_role` and sourcing email/phone from
        the same row — no separate role/person picker needed, unlike
        the generic `/users` endpoint."""
        staff = await UsersRepository.find_staff_in_school(session, school_id, staff_id)
        if staff is None:
            raise NotFoundError(f"Staff {staff_id!r} not found.")
        if not staff.system_role:
            raise ValidationError("This staff member has no role set.")
        return await UsersService.provision_login(
            session,
            school_id,
            role=staff.system_role,
            linked_id=staff_id,
            email=staff.email,
            phone=staff.phone,
            display_name=f"{staff.first_name} {staff.last_name}".strip(),
            supabase=supabase,
            actor_user_id=actor_user_id,
        )

    @staticmethod
    async def provision_login(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        role: str,
        linked_id: UUID | None,
        email: str | None,
        phone: str | None,
        display_name: str,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> UserRead:
        """Create a Supabase auth user + local bridge row. Provisions
        whatever identifiers exist: an email sends our own branded invite
        (mints the link via `generate_link`, password set via the link);
        a phone is set + confirmed so SMS-OTP works; both when both are
        present. A phone-only login skips the invite entirely and uses
        `create_user` with an unused random password."""
        await UsersService._validate_link(session, school_id, role, linked_id)

        if linked_id is not None:
            existing = await UsersRepository.find_by_linked_id(session, school_id, linked_id)
            if existing is not None:
                raise ConflictError("This person already has a login.")

        if not email and not phone:
            raise ValidationError("A phone or email is required to create a login.")

        app_metadata = {
            "role": role,
            "school_id": str(school_id),
            "linked_id": str(linked_id) if linked_id else None,
        }

        if email:
            created = await supabase.generate_link(
                type="invite", email=email, redirect_to=_invite_redirect_url()
            )
            auth_uid = UUID(str(created["user_id"]))
            invite_link = str(created["action_link"])
            await supabase.update_user_by_id(
                auth_uid,
                phone=phone,
                phone_confirm=bool(phone),
                app_metadata=app_metadata,
                user_metadata={"display_name": display_name, "must_change_password": True},
            )
            must_change_password = True
        else:
            # Phone-only: no inbox to invite, so create the user directly
            # with a confirmed phone. The random password is never used —
            # the guardian signs in via SMS-OTP.
            created = await supabase.create_user(
                password=secrets.token_urlsafe(24),
                phone=phone,
                phone_confirm=True,
                app_metadata=app_metadata,
                user_metadata={"display_name": display_name, "must_change_password": False},
            )
            auth_uid = UUID(str(created["id"]))
            must_change_password = False

        onboarding_sms_recipient = phone if not email else None

        school_uuid = school_id if isinstance(school_id, UUID) else UUID(str(school_id))
        row = User(
            id=auth_uid,
            school_id=school_uuid,
            email=email,
            role=role,
            linked_id=linked_id,
            is_active=True,
            must_change_password=must_change_password,
        )
        await UsersRepository.insert(session, row)
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=USER_CREATED,
            target_table="users",
            target_id=auth_uid,
            after={
                "role": role,
                "linkedId": str(linked_id) if linked_id else None,
                "via": "email" if email else "phone",
            },
        )

        if onboarding_sms_recipient:
            await UsersService._emit_onboarding_sms(
                school_id,
                phone=onboarding_sms_recipient,
                guardian_id=linked_id if role == PARENT else None,
            )

        if email:
            await UsersService._emit_account_invite_email(
                session,
                school_id,
                email=email,
                display_name=display_name,
                invite_link=invite_link,
            )

        return await UsersService._read_or_404(session, school_id, auth_uid)

    @staticmethod
    async def _emit_account_invite_email(
        session: AsyncSession,
        school_id: UUID | str,
        *,
        email: str,
        display_name: str,
        invite_link: str,
    ) -> None:
        """The one email every account creation with an email needs —
        not gated by any preference, same "always send, no opt-out"
        rationale as `_emit_onboarding_sms`: you can't opt out of the
        email that lets you set up your own account. Best-effort, same
        as every other email emit in this codebase — a broken event bus
        must not fail account creation."""
        try:
            school = await SchoolsService.get(session, school_id)
            await inngest_client.send(
                inngest.Event(
                    name="email/account-invite.requested",
                    data={
                        "email": email,
                        "display_name": display_name,
                        "invite_link": invite_link,
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or "",
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit account-invite email event for school %s", school_id)
            sentry_sdk.capture_exception()

    @staticmethod
    async def _emit_onboarding_sms(
        school_id: UUID | str, *, phone: str, guardian_id: UUID | None
    ) -> None:
        """Phone-only accounts (the common Parent case) get no email
        invite from Supabase — this is their only notice the account
        exists. Treated as transactional, no opt-out: there's no
        `user_preferences` row yet to check, and gating it would
        recreate the exact "nobody told me my account exists" gap this
        closes. Best-effort, same rationale as the email-job emits — a
        broken event bus must not fail account creation."""
        try:
            await inngest_client.send(
                inngest.Event(
                    name="sms/fanout.requested",
                    data={
                        "school_id": str(school_id),
                        "category": "onboarding",
                        "body": (
                            "Your UHAS SMS account is ready. Log in with your "
                            f"phone number at {settings.app_url}/login."
                        ),
                        "recipients": [
                            {
                                "phone": phone,
                                "guardian_id": str(guardian_id) if guardian_id else None,
                            }
                        ],
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit onboarding SMS event for school %s", school_id)
            sentry_sdk.capture_exception()

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

    @staticmethod
    async def reset_mfa(
        session: AsyncSession,
        school_id: UUID | str,
        user_id: UUID,
        *,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> int:
        """Admin lockout recovery: delete all of a user's MFA factors.

        Supabase has no backup codes, so a user who loses their
        authenticator can only get back in by an admin clearing their
        2FA. Deleting a verified factor also logs the user out of all
        sessions (Supabase behaviour) — they then log in with just their
        password and can re-enrol. Audit-logged as `USER_MFA_RESET`.
        Returns the number of factors removed.
        """
        # 404 if the user isn't in this school — same scoping as every
        # other admin action here.
        await UsersService._get_or_404(session, school_id, user_id)
        removed = await supabase.reset_mfa(user_id)
        await write_audit_log(
            session,
            school_id=school_id,
            user_id=actor_user_id,
            action=USER_MFA_RESET,
            target_table="users",
            target_id=user_id,
            after={"factorsRemoved": removed},
        )
        return removed

    @staticmethod
    async def request_password_reset(
        session: AsyncSession, *, email: str, supabase: SupabaseAdminClient
    ) -> None:
        """Public, unauthenticated entry point (`POST /auth/reset-password`)
        — replaces the frontend's direct `supabase.auth.resetPasswordForEmail`
        call so the email goes out through our own branded system instead
        of Supabase's.

        Enumeration-safe by construction: every branch below — unknown
        email, cooldown still active, Supabase itself reporting no such
        auth user — falls through to the same `return None` with no
        distinguishing side effect the caller could observe. The router
        always sends back one generic response regardless of what
        happened here."""
        user = await UsersRepository.find_by_email(session, email)
        if user is None:
            return

        now = _now()
        if (
            user.last_password_reset_sent_at is not None
            and now - user.last_password_reset_sent_at < PASSWORD_RESET_COOLDOWN
        ):
            return

        try:
            link = await supabase.generate_link(
                type="recovery", email=email, redirect_to=_reset_redirect_url()
            )
        except NotFoundError:
            # Our bridge row exists but Supabase disagrees — stay silent
            # rather than surface the mismatch to an anonymous caller.
            return

        user.last_password_reset_sent_at = now

        try:
            school = await SchoolsService.get(session, user.school_id)
            await inngest_client.send(
                inngest.Event(
                    name="email/password-reset.requested",
                    data={
                        "email": email,
                        "reset_link": link["action_link"],
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or "",
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit password-reset email event for user %s", user.id)
            sentry_sdk.capture_exception()
