"""Business logic for the Staff domain.

Encapsulates:
  - slug generation (`STAFF-001` per-school sequence)
  - the "non-Admin roles must declare a division" invariant
  - the "Unit Heads must be Teachers" invariant
  - audit-log writes for role changes (`ROLE_CHANGE` action)

Routes never reach into the repository directly — they call services
and let services compose the invariants.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.roles import ACCOUNTANT, ADMIN, DEPUTY_HEAD, TEACHER
from app.core.security import CurrentUser
from app.core.slug import insert_with_sequential_slug, per_school_slug_resolver
from app.features.audit.actions import ROLE_CHANGE, USER_DEACTIVATED, USER_REACTIVATED
from app.features.audit.service import write_audit_log
from app.features.notifications.service import NotificationsService
from app.features.staff.model import Staff, StaffDocument, StaffQualification
from app.features.staff.repository import StaffRepository
from app.features.staff.schema import (
    StaffCreate,
    StaffDocumentCreate,
    StaffQualificationCreate,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
)
from app.features.subjects.model import Subject
from app.features.subjects.repository import SubjectsRepository
from app.features.users.service import UsersService
from app.features.users.supabase_admin import SupabaseAdminClient

_SELF_SERVICE_ROLES = frozenset({DEPUTY_HEAD, TEACHER, ACCOUNTANT})
_SELF_SERVICE_FIELDS = frozenset({"photo_url"})


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
        *,
        user: CurrentUser,
        supabase: SupabaseAdminClient,
    ) -> Staff:
        """Partial update — only fields present in `payload` are touched.

        Admins can touch any field on any staff row. Non-Admin staff
        (Deputy Head, Teacher, Accountant) can only patch `photo_url` on
        their own row — the profile page uses this to let each user set
        their own avatar without a separate endpoint. Neither `phone`
        nor `email` is in that self-service allowlist, so a phone/email
        change here is always Admin-driven — trusted the same way
        Admin is already trusted to set the initial phone/email at
        account creation, syncs straight to Supabase Auth with no
        OTP/confirmation-link challenge (contrast
        `MeService.confirm_phone`/`confirm_email`'s self-service paths).
        """
        if user.role != ADMIN:
            StaffService._authorize_self_service_update(staff_id, payload, user)

        row = await StaffService.get(session, school_id, staff_id)
        changes = payload.model_dump(exclude_unset=True)
        for field, value in changes.items():
            setattr(row, field, value)
        await session.flush()

        new_phone = changes.get("phone")
        new_email = changes.get("email")
        if new_phone is not None or new_email is not None:
            staff_user = await NotificationsService.find_user_for_linked(
                session, school_id, staff_id
            )
            if staff_user is not None:
                supabase_kwargs: dict[str, Any] = {}
                if new_phone is not None:
                    supabase_kwargs["phone"] = new_phone
                    supabase_kwargs["phone_confirm"] = True
                if new_email is not None:
                    staff_user.email = new_email
                    supabase_kwargs["email"] = new_email
                    supabase_kwargs["email_confirm"] = True
                await supabase.update_user_by_id(staff_user.id, **supabase_kwargs)
                await session.flush()

        return row

    @staticmethod
    def _authorize_self_service_update(
        staff_id: UUID | str,
        payload: StaffUpdate,
        user: CurrentUser,
    ) -> None:
        if user.role not in _SELF_SERVICE_ROLES:
            raise ForbiddenError("This action requires Admin.")
        if not user.linked_id or str(user.linked_id) != str(staff_id):
            raise ForbiddenError("You can only update your own staff profile.")
        touched = set(payload.model_dump(exclude_unset=True).keys())
        if not touched.issubset(_SELF_SERVICE_FIELDS):
            raise ForbiddenError("You can only update your own photo.")

    @staticmethod
    async def change_role(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffRoleChange,
        *,
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> Staff:
        """Apply a role change + clear unit-head flags + audit log.

        Also syncs the linked login's role — `staff.system_role` isn't
        what actually gates access; the JWT's `app_metadata.role` is.
        Without this, "changing" a staff member's role here left their
        real login role (and thus their dashboard/permissions) unchanged
        until a separate, nonexistent admin flow updated it — the two
        could silently disagree forever. `app_metadata` is Supabase's
        replace-not-merge, so the full object (role/school_id/linked_id)
        is resent, matching `UsersService.provision_login`'s shape.
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
            linked_user = await NotificationsService.find_user_for_linked(
                session, school_id, staff_id
            )
            if linked_user is not None:
                linked_user.role = payload.system_role
                await supabase.update_user_by_id(
                    linked_user.id,
                    app_metadata={
                        "role": payload.system_role,
                        "school_id": str(school_id),
                        "linked_id": str(staff_id),
                    },
                )
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
        supabase: SupabaseAdminClient,
        actor_user_id: UUID | str,
    ) -> Staff:
        """Deactivate / reactivate — soft delete in effect.

        Also flips the linked `users` row (if this staff member has a
        login) via `UsersService.set_active`, which sets the real
        Supabase ban — without this, a deactivated staff member's
        session and login kept working indefinitely, since `staff.is_active`
        alone was never enforced anywhere. A staff row created ahead of
        its login being provisioned (no linked `users` row yet) just
        skips this step; there's no session to revoke.
        """
        row = await StaffService.get(session, school_id, staff_id)
        if row.is_active == active:
            raise ConflictError(f"Staff member is already {'active' if active else 'inactive'}.")
        row.is_active = active
        await session.flush()

        linked_user = await NotificationsService.find_user_for_linked(session, school_id, staff_id)
        if linked_user is not None:
            await UsersService.set_active(
                session,
                school_id,
                linked_user.id,
                active=active,
                supabase=supabase,
                actor_user_id=actor_user_id,
                action=USER_REACTIVATED if active else USER_DEACTIVATED,
            )
        return row

    # ── subject expertise ───────────────────────────────────────────────

    @staticmethod
    async def list_subject_expertise(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str
    ) -> list[Subject]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        return await StaffRepository.list_subject_expertise(session, staff_id)

    @staticmethod
    async def replace_subject_expertise(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str, subject_ids: list[UUID]
    ) -> list[Subject]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        for subject_id in subject_ids:
            if not await SubjectsRepository.get_by_id(session, school_id, subject_id):
                raise ValidationError(f"Subject {subject_id!r} not found in this school.")
        await StaffRepository.replace_subject_expertise(session, staff_id, subject_ids)
        return await StaffRepository.list_subject_expertise(session, staff_id)

    # ── qualifications ───────────────────────────────────────────────────

    @staticmethod
    async def list_qualifications(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str
    ) -> list[StaffQualification]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        return await StaffRepository.list_qualifications(session, staff_id)

    @staticmethod
    async def add_qualification(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffQualificationCreate,
    ) -> list[StaffQualification]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        qualification = StaffQualification(
            school_id=school_id,
            staff_id=staff_id,
            name=payload.name,
            institution=payload.institution,
            year_obtained=payload.year_obtained,
        )
        await StaffRepository.insert_qualification(session, qualification)
        return await StaffRepository.list_qualifications(session, staff_id)

    @staticmethod
    async def remove_qualification(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        qualification_id: UUID | str,
    ) -> list[StaffQualification]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        qualification = await StaffRepository.get_qualification(
            session, school_id, qualification_id
        )
        if qualification is None or str(qualification.staff_id) != str(staff_id):
            raise NotFoundError(f"Qualification {qualification_id!r} not found.")
        await StaffRepository.delete_qualification(session, qualification)
        return await StaffRepository.list_qualifications(session, staff_id)

    # ── documents ────────────────────────────────────────────────────────

    @staticmethod
    async def list_documents(
        session: AsyncSession, school_id: UUID | str, staff_id: UUID | str, *, user: CurrentUser
    ) -> list[tuple[StaffDocument, Staff]]:
        target = await StaffService.get(session, school_id, staff_id)  # 404 if missing
        is_self = user.linked_id is not None and str(user.linked_id) == str(staff_id)
        if user.role == ADMIN or is_self:
            return await StaffRepository.list_documents(session, staff_id)
        if user.role == DEPUTY_HEAD and user.linked_id and target.division:
            caller = await StaffRepository.get_by_id(session, school_id, user.linked_id)
            if caller and caller.division == target.division:
                return await StaffRepository.list_documents(session, staff_id)
        raise ForbiddenError("You may only view your own documents.")

    @staticmethod
    async def add_document(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        payload: StaffDocumentCreate,
        *,
        actor_staff_id: UUID | str,
    ) -> list[tuple[StaffDocument, Staff]]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        document = StaffDocument(
            school_id=school_id,
            staff_id=staff_id,
            label=payload.label,
            other_label=payload.other_label,
            storage_path=payload.storage_path,
            uploaded_by_id=actor_staff_id,
        )
        await StaffRepository.insert_document(session, document)
        return await StaffRepository.list_documents(session, staff_id)

    @staticmethod
    async def remove_document(
        session: AsyncSession,
        school_id: UUID | str,
        staff_id: UUID | str,
        document_id: UUID | str,
    ) -> list[tuple[StaffDocument, Staff]]:
        await StaffService.get(session, school_id, staff_id)  # 404 if missing
        document = await StaffRepository.get_document(session, school_id, document_id)
        if document is None or str(document.staff_id) != str(staff_id):
            raise NotFoundError(f"Document {document_id!r} not found.")
        await StaffRepository.delete_document(session, document)
        return await StaffRepository.list_documents(session, staff_id)
