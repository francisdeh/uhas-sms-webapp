"""Compose the caller's `SessionUser` shape from three DB reads + JWT claims.

Called only from `GET /me`. Kept out of `router.py` so the assembly
logic is unit-testable without hitting FastAPI.
"""

from __future__ import annotations

import logging
from uuid import UUID

import inngest
import sentry_sdk
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.core.inngest import inngest_client
from app.core.phone import normalize_ghana_phone
from app.core.roles import ACCOUNTANT, ADMIN, DEPUTY_HEAD, PARENT, TEACHER
from app.core.school_structure import Division
from app.core.security import CurrentUser
from app.features.audit.actions import ACCOUNT_SELF_DEACTIVATED
from app.features.guardians.model import Guardian
from app.features.me.schema import MeRead, MeUpdate
from app.features.schools.service import SchoolsService
from app.features.staff.model import Staff
from app.features.users.model import User, UserPreferences
from app.features.users.repository import UsersRepository
from app.features.users.service import UsersService
from app.features.users.supabase_admin import SupabaseAdminClient

logger = logging.getLogger(__name__)

_ROLE_DASHBOARD_PREFIX = {
    ADMIN: "admin",
    DEPUTY_HEAD: "deputy-head",
    TEACHER: "teacher",
    PARENT: "parent",
    ACCOUNTANT: "accountant",
}


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

        prefs = await session.scalar(
            select(UserPreferences).where(UserPreferences.user_id == UUID(user.user_id))
        )

        def _pref(field: str) -> bool:
            return bool(getattr(prefs, field)) if prefs is not None else True

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
            email_on_lesson_plan_rejected=_pref("email_on_lesson_plan_rejected"),
            email_on_results_published=_pref("email_on_results_published"),
            email_on_appointment_activity=_pref("email_on_appointment_activity"),
            sms_on_appointment_activity=_pref("sms_on_appointment_activity"),
            email_on_appointment_decided=_pref("email_on_appointment_decided"),
            sms_on_appointment_decided=_pref("sms_on_appointment_decided"),
            email_on_leave_activity=_pref("email_on_leave_activity"),
            sms_on_leave_activity=_pref("sms_on_leave_activity"),
            email_on_leave_decided=_pref("email_on_leave_decided"),
            sms_on_leave_decided=_pref("sms_on_leave_decided"),
            email_on_attendance_absent=_pref("email_on_attendance_absent"),
            sms_on_attendance_absent=_pref("sms_on_attendance_absent"),
            email_on_assignment_created=_pref("email_on_assignment_created"),
            sms_on_assignment_created=_pref("sms_on_assignment_created"),
            email_on_scheme_activity=_pref("email_on_scheme_activity"),
            sms_on_scheme_activity=_pref("sms_on_scheme_activity"),
            email_on_scheme_decided=_pref("email_on_scheme_decided"),
            sms_on_scheme_decided=_pref("sms_on_scheme_decided"),
            email_on_promotion_season=_pref("email_on_promotion_season"),
            sms_on_promotion_season=_pref("sms_on_promotion_season"),
            email_on_promotion_activity=_pref("email_on_promotion_activity"),
            sms_on_promotion_activity=_pref("sms_on_promotion_activity"),
            email_on_promotion_decided=_pref("email_on_promotion_decided"),
            sms_on_promotion_decided=_pref("sms_on_promotion_decided"),
            email_on_announcement_posted=_pref("email_on_announcement_posted"),
            sms_on_announcement_posted=_pref("sms_on_announcement_posted"),
        )

    @staticmethod
    async def update(
        session: AsyncSession,
        user: CurrentUser,
        payload: MeUpdate,
        *,
        supabase: SupabaseAdminClient,
    ) -> MeRead:
        """Self-service update of the caller's own profile + preferences.

        `display_name`/`phone` write to the linked `staff`/`guardians`
        row directly — there's no separate "users" row to update here
        (unlike the admin-side `UsersService.update`, which patches a
        bridge-table row this one skips entirely since the caller IS
        the row's owner). The boolean preference fields write to
        `user_preferences` instead, which isn't tied to a linked row —
        it works even for an account with no staff/guardian record yet.
        """
        changes = payload.model_dump(exclude_unset=True)
        display_name = changes.get("display_name")
        pref_fields = (
            "email_on_lesson_plan_rejected",
            "email_on_results_published",
            "email_on_appointment_activity",
            "sms_on_appointment_activity",
            "email_on_appointment_decided",
            "sms_on_appointment_decided",
            "email_on_leave_activity",
            "sms_on_leave_activity",
            "email_on_leave_decided",
            "sms_on_leave_decided",
            "email_on_attendance_absent",
            "sms_on_attendance_absent",
            "email_on_assignment_created",
            "sms_on_assignment_created",
            "email_on_scheme_activity",
            "sms_on_scheme_activity",
            "email_on_scheme_decided",
            "sms_on_scheme_decided",
            "email_on_promotion_season",
            "sms_on_promotion_season",
            "email_on_promotion_activity",
            "sms_on_promotion_activity",
            "email_on_promotion_decided",
            "sms_on_promotion_decided",
            "email_on_announcement_posted",
            "sms_on_announcement_posted",
        )
        pref_changes = {f: changes[f] for f in pref_fields if changes.get(f) is not None}

        if display_name is not None:
            if not user.school_id or not user.linked_id:
                raise ValidationError("No linked staff or guardian record to update.")
            linked_uuid = UUID(user.linked_id)

            if user.role == PARENT:
                guardian = await UsersRepository.find_guardian_in_school(
                    session, user.school_id, linked_uuid
                )
                if guardian is None:
                    raise ForbiddenError("Linked guardian record not found.")
                first, _, last = display_name.partition(" ")
                guardian.first_name = first
                guardian.last_name = last
            else:
                staff = await UsersRepository.find_staff_in_school(
                    session, user.school_id, linked_uuid
                )
                if staff is None:
                    raise ForbiddenError("Linked staff record not found.")
                first, _, last = display_name.partition(" ")
                staff.first_name = first
                staff.last_name = last

            await supabase.update_user_by_id(
                UUID(user.user_id), user_metadata={"display_name": display_name}
            )

        if pref_changes:
            prefs = await session.scalar(
                select(UserPreferences).where(UserPreferences.user_id == UUID(user.user_id))
            )
            if prefs is None:
                session.add(UserPreferences(user_id=UUID(user.user_id), **pref_changes))
            else:
                for field, value in pref_changes.items():
                    setattr(prefs, field, value)

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

    @staticmethod
    async def confirm_phone(
        session: AsyncSession,
        user: CurrentUser,
        *,
        supabase: SupabaseAdminClient,
    ) -> MeRead:
        """Mirror Supabase Auth's already-confirmed phone into the
        caller's linked `staff`/`guardians` row.

        Called after the frontend completes Supabase's own
        `updateUser({phone}) -> verifyOtp({type: "phone_change"})`
        round trip — this endpoint never accepts a phone value from
        the request, it only ever reads back what Supabase itself has
        already confirmed, so there's no way to use it to point a
        login at a number the caller doesn't control.
        """
        if not user.school_id or not user.linked_id:
            raise ValidationError("No linked staff or guardian record to update.")

        auth_user = await supabase.get_user_by_id(UUID(user.user_id))
        raw_phone = auth_user.get("phone")
        if not raw_phone:
            raise ValidationError("No confirmed phone number found on this account.")
        # Supabase stores phone without a leading "+"; normalize so the
        # local mirror always matches this app's canonical +233… form
        # regardless of exactly how Supabase hands it back.
        phone = normalize_ghana_phone(raw_phone)

        linked_uuid = UUID(user.linked_id)
        if user.role == PARENT:
            guardian = await UsersRepository.find_guardian_in_school(
                session, user.school_id, linked_uuid
            )
            if guardian is None:
                raise ForbiddenError("Linked guardian record not found.")
            guardian.phone = phone
        else:
            staff = await UsersRepository.find_staff_in_school(session, user.school_id, linked_uuid)
            if staff is None:
                raise ForbiddenError("Linked staff record not found.")
            staff.phone = phone

        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise ConflictError("That phone number is already in use.") from exc

        return await MeService.get(session, user)

    @staticmethod
    async def confirm_email(
        session: AsyncSession,
        user: CurrentUser,
        *,
        supabase: SupabaseAdminClient,
    ) -> MeRead:
        """Mirror Supabase Auth's already-confirmed email into
        `users.email` (and the linked `staff`/`guardians` row, if one
        exists, for display consistency in the admin lists).

        Called after the frontend's `updateUser({email})` — unlike
        phone, Supabase confirms an email change via a link the user
        clicks in their inbox, not an inline OTP, so there's no
        synchronous "verify" step on this side to pair it with. Safe
        to call any time (e.g. on every profile-page load): it just
        mirrors Supabase's current confirmed email, a no-op if nothing
        changed. Never accepts an email value from the request.
        """
        auth_user = await supabase.get_user_by_id(UUID(user.user_id))
        email = auth_user.get("email")
        if not email:
            raise ValidationError("No confirmed email address found on this account.")

        user_row = await session.scalar(select(User).where(User.id == UUID(user.user_id)))
        if user_row is None:
            raise ForbiddenError("Session has no matching user row.")
        user_row.email = email

        if user.linked_id:
            linked_uuid = UUID(user.linked_id)
            if user.role == PARENT:
                guardian = await UsersRepository.find_guardian_in_school(
                    session, user.school_id or "", linked_uuid
                )
                if guardian is not None:
                    guardian.email = email
            else:
                staff = await UsersRepository.find_staff_in_school(
                    session, user.school_id or "", linked_uuid
                )
                if staff is not None:
                    staff.email = email

        try:
            await session.flush()
        except IntegrityError as exc:
            await session.rollback()
            raise ConflictError("That email address is already in use.") from exc

        # `MeService.get` prefers the JWT's `email` claim over `users.email`
        # for the common case (it's fresher there day-to-day) — but right
        # after a confirm, the JWT is the stale side (it won't carry the
        # new address until the session's next refresh). Override with
        # what we just confirmed so the response is correct immediately.
        result = await MeService.get(session, user)
        return result.model_copy(update={"email": email})

    @staticmethod
    async def request_email_change(
        session: AsyncSession,
        user: CurrentUser,
        *,
        new_email: str,
        supabase: SupabaseAdminClient,
    ) -> None:
        """Replaces the frontend's direct `supabase.auth.updateUser({email})`
        call — mints both confirmation links via `generate_link` and sends
        them through our own branded system instead of Supabase's. Supabase
        still owns the actual dual-confirmation state machine; once both
        links are clicked the change completes on Supabase's side exactly
        as before, and the existing `POST /me/email/confirm` mirrors it
        into `users.email` (unchanged, not touched by this method).

        Requires an existing email on the account — `generate_link` looks
        the account up BY email, so there's no way to mint a "confirm new
        address" link for a phone-only account that has none yet. That
        one case (adding, not changing, an email) keeps using Supabase's
        own direct client-side call; not migrated here."""
        user_row = await session.scalar(select(User).where(User.id == UUID(user.user_id)))
        if user_row is None:
            raise ForbiddenError("Session has no matching user row.")
        old_email = user_row.email
        if not old_email:
            raise ValidationError(
                "This account has no email yet — that's an add, not a change. "
                "Ask an Admin to add one for you."
            )
        if new_email == old_email:
            raise ValidationError("That's already your current email address.")

        redirect_prefix = _ROLE_DASHBOARD_PREFIX.get(user.role or "", "")
        redirect_to = f"{settings.app_url}/{redirect_prefix}/profile?tab=security"

        current_link = await supabase.generate_link(
            type="email_change_current",
            email=old_email,
            new_email=new_email,
            redirect_to=redirect_to,
        )
        new_link = await supabase.generate_link(
            type="email_change_new",
            email=old_email,
            new_email=new_email,
            redirect_to=redirect_to,
        )

        try:
            school = await SchoolsService.get(session, user.school_id or "")
            await inngest_client.send(
                inngest.Event(
                    name="email/account-email-change.requested",
                    data={
                        "old_email": old_email,
                        "new_email": new_email,
                        "current_link": current_link["action_link"],
                        "new_link": new_link["action_link"],
                        "school_name": school.name,
                        "school_address": school.address or "",
                        "school_contact_email": school.email or school.email_reply_to or "",
                    },
                )
            )
        except Exception:
            logger.exception("Failed to emit email-change event for user %s", user.user_id)
            sentry_sdk.capture_exception()

    @staticmethod
    async def deactivate(
        session: AsyncSession,
        user: CurrentUser,
        *,
        supabase: SupabaseAdminClient,
    ) -> None:
        """Deactivate the caller's own account.

        Admins are blocked (403) — a self-deactivating sole admin would
        orphan the school with no one able to reactivate anyone. They
        deactivate via the admin users page instead. Reactivation is
        always admin-only (a deactivated user can't log back in), so
        there's no self-service counterpart to this.

        Reuses `UsersService.set_active` so the flag flip + Supabase ban
        + audit row stay identical to admin-initiated deactivation; only
        the audit action (`ACCOUNT_SELF_DEACTIVATED`) and actor differ.
        """
        if not user.school_id:
            raise ForbiddenError("Session is missing school scope.")
        if user.role == ADMIN:
            raise ForbiddenError(
                "Admin accounts cannot self-deactivate. Ask another admin to do it."
            )
        await UsersService.set_active(
            session,
            user.school_id,
            UUID(user.user_id),
            active=False,
            supabase=supabase,
            actor_user_id=user.user_id,
            action=ACCOUNT_SELF_DEACTIVATED,
        )
