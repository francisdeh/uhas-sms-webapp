"""Service-level tests for StaffService — exercises invariants + audit
+ slug generation against a real transactional Postgres."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.core.security import CurrentUser
from app.features.audit.model import AuditLog
from app.features.schools.model import School
from app.features.staff.schema import (
    StaffCreate,
    StaffRoleChange,
    StaffUnitHeadToggle,
    StaffUpdate,
)
from app.features.staff.service import StaffService
from app.features.staff.tests.conftest import SCHOOL_UUID, USER_UUID
from app.features.users.model import User


class _FakeSupabase:
    """Minimal `SupabaseAdminClient` double — this suite only cares
    that `update_user_by_id` gets called with the right phone, not
    about a real Supabase round trip."""

    def __init__(self) -> None:
        self.update_calls: list[dict[str, Any]] = []

    async def create_user(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def update_user_by_id(self, user_id: UUID | str, **kwargs: Any) -> None:
        self.update_calls.append({"user_id": user_id, **kwargs})

    async def delete_user(self, user_id: UUID | str) -> None:
        raise NotImplementedError

    async def invite_user_by_email(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def generate_link(self, **kwargs: Any) -> dict[str, Any]:
        raise NotImplementedError

    async def reset_mfa(self, user_id: UUID | str) -> int:
        raise NotImplementedError

    async def get_user_by_id(self, user_id: UUID | str) -> dict[str, Any]:
        raise NotImplementedError


def _admin_user() -> CurrentUser:
    return CurrentUser(
        user_id=str(USER_UUID),
        email="admin@u.gh",
        phone=None,
        role="Admin",
        school_id=str(SCHOOL_UUID),
        linked_id=None,
    )


def _create_payload(
    *,
    email: str = "teacher.one@uhas.edu.gh",
    first_name: str = "Akua",
    last_name: str = "Mensah",
    system_role: str = "Teacher",
    division: str | None = "JHS",
    uhas_id: str | None = None,
) -> StaffCreate:
    return StaffCreate(
        first_name=first_name,
        last_name=last_name,
        rank="Senior Teacher",
        system_role=system_role,
        division=division,
        email=email,
        phone="+233241112233",
        uhas_id=uhas_id,
    )


async def test_create_assigns_first_slug(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    assert row.slug == "STAFF-001"
    assert row.is_active is True


async def test_create_increments_slug(db_session: AsyncSession, seed_school: School) -> None:
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="a@u.gh"))
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="b@u.gh"))
    third = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="c@u.gh"))
    assert third.slug == "STAFF-003"


async def test_create_rejects_non_admin_without_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    with pytest.raises(ValidationError):
        await StaffService.create(db_session, SCHOOL_UUID, _create_payload(division=None))


async def test_create_admin_does_not_need_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(
        db_session, SCHOOL_UUID, _create_payload(system_role="Admin", division=None)
    )
    assert row.system_role == "Admin"
    assert row.division is None


async def test_create_rejects_duplicate_email(
    db_session: AsyncSession, seed_school: School
) -> None:
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="dup@u.gh"))
    with pytest.raises(ConflictError):
        await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="dup@u.gh"))


async def test_create_rejects_duplicate_uhas_id(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Regression test: a duplicate `uhas_id` must raise a clear
    ConflictError, not fall through to `insert_with_sequential_slug`'s
    generic retry-and-misreport-as-a-slug-collision path."""
    await StaffService.create(
        db_session, SCHOOL_UUID, _create_payload(email="a@u.gh", uhas_id="UHAS1141")
    )
    with pytest.raises(ConflictError, match="UHAS Staff ID"):
        await StaffService.create(
            db_session, SCHOOL_UUID, _create_payload(email="b@u.gh", uhas_id="UHAS1141")
        )


async def test_create_allows_blank_uhas_id_for_multiple_staff(
    db_session: AsyncSession, seed_school: School
) -> None:
    """`uhas_id` is optional — omitting it for multiple staff shouldn't
    trip the duplicate check (None isn't a real collision)."""
    await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="a@u.gh"))
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="b@u.gh"))
    assert row.uhas_id is None


async def test_update_only_touches_present_fields(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(phone="+233500000000"),
        user=_admin_user(),
        supabase=_FakeSupabase(),
    )
    assert updated.phone == "+233500000000"
    assert updated.first_name == row.first_name  # untouched


async def test_update_rejects_duplicate_uhas_id(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Regression test: patching `uhas_id` to a value another staff row
    already has must raise ConflictError before the flush — `update`
    has no IntegrityError handling at all, so without this pre-check
    the collision would surface as a raw unhandled 500."""
    await StaffService.create(
        db_session, SCHOOL_UUID, _create_payload(email="a@u.gh", uhas_id="UHAS1141")
    )
    other = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="b@u.gh"))
    with pytest.raises(ConflictError, match="UHAS Staff ID"):
        await StaffService.update(
            db_session,
            SCHOOL_UUID,
            other.id,
            StaffUpdate(uhas_id="UHAS1141"),
            user=_admin_user(),
            supabase=_FakeSupabase(),
        )


async def test_update_allows_resaving_own_unchanged_uhas_id(
    db_session: AsyncSession, seed_school: School
) -> None:
    """The duplicate check excludes the row being updated — re-saving a
    staff member's own existing `uhas_id` (e.g. alongside an unrelated
    field edit) isn't a collision with itself."""
    row = await StaffService.create(
        db_session, SCHOOL_UUID, _create_payload(email="a@u.gh", uhas_id="UHAS1141")
    )
    updated = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(uhas_id="UHAS1141", phone="+233500000000"),
        user=_admin_user(),
        supabase=_FakeSupabase(),
    )
    assert updated.uhas_id == "UHAS1141"
    assert updated.phone == "+233500000000"


async def test_update_writes_staff_edit_audit_row(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        (await StaffService.create(db_session, SCHOOL_UUID, _create_payload())).id,
        StaffUpdate(phone="+233500000000"),
        user=_admin_user(),
        supabase=_FakeSupabase(),
    )
    audit_row = (
        await db_session.execute(
            select(AuditLog).where(AuditLog.action == "STAFF_EDIT", AuditLog.target_id == row.id)
        )
    ).scalar_one()
    assert audit_row.before == {"phone": "+233241112233"}
    assert audit_row.after == {"phone": "+233500000000"}


async def test_update_self_service_photo_skips_audit(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    self_user = CurrentUser(
        user_id=str(uuid4()),
        email="teacher.one@uhas.edu.gh",
        phone=None,
        role="Teacher",
        school_id=str(SCHOOL_UUID),
        linked_id=str(row.id),
    )
    await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(photo_url="https://example.com/photo.jpg"),
        user=self_user,
        supabase=_FakeSupabase(),
    )
    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "STAFF_EDIT")))
        .scalars()
        .all()
    )
    assert audit_rows == []


async def test_update_phone_syncs_supabase_when_login_exists(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    staff_user_id = uuid4()
    db_session.add(
        User(
            id=staff_user_id,
            school_id=SCHOOL_UUID,
            email="teacher.one@uhas.edu.gh",
            role="Teacher",
            linked_id=row.id,
            is_active=True,
        )
    )
    await db_session.flush()

    fake = _FakeSupabase()
    updated = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(phone="0244000999"),
        user=_admin_user(),
        supabase=fake,
    )
    assert updated.phone == "+233244000999"
    assert len(fake.update_calls) == 1
    assert str(fake.update_calls[0]["user_id"]) == str(staff_user_id)
    assert fake.update_calls[0]["phone"] == "+233244000999"
    assert fake.update_calls[0]["phone_confirm"] is True


async def test_update_phone_skips_supabase_when_no_login(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    fake = _FakeSupabase()
    await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(phone="0244000999"),
        user=_admin_user(),
        supabase=fake,
    )
    assert fake.update_calls == []


async def test_update_email_syncs_supabase_and_users_row_when_login_exists(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    staff_user_id = uuid4()
    db_session.add(
        User(
            id=staff_user_id,
            school_id=SCHOOL_UUID,
            email="teacher.one@uhas.edu.gh",
            role="Teacher",
            linked_id=row.id,
            is_active=True,
        )
    )
    await db_session.flush()

    fake = _FakeSupabase()
    updated = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(email="new.teacher@uhas.edu.gh"),
        user=_admin_user(),
        supabase=fake,
    )
    assert updated.email == "new.teacher@uhas.edu.gh"
    assert len(fake.update_calls) == 1
    assert str(fake.update_calls[0]["user_id"]) == str(staff_user_id)
    assert fake.update_calls[0]["email"] == "new.teacher@uhas.edu.gh"
    assert fake.update_calls[0]["email_confirm"] is True

    user_row = await db_session.scalar(select(User).where(User.id == staff_user_id))
    assert user_row is not None
    assert user_row.email == "new.teacher@uhas.edu.gh"


async def test_update_teacher_can_patch_own_photo(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    teacher = CurrentUser(
        user_id=str(USER_UUID),
        email="t@u.gh",
        phone=None,
        role="Teacher",
        school_id=str(SCHOOL_UUID),
        linked_id=str(row.id),
    )
    updated = await StaffService.update(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUpdate(photo_url="https://cdn.example/img.png"),
        user=teacher,
        supabase=_FakeSupabase(),
    )
    assert updated.photo_url == "https://cdn.example/img.png"


async def test_update_teacher_cannot_patch_other_staff_row(
    db_session: AsyncSession, seed_school: School
) -> None:
    other = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="a@u.gh"))
    me = await StaffService.create(db_session, SCHOOL_UUID, _create_payload(email="b@u.gh"))
    teacher = CurrentUser(
        user_id=str(USER_UUID),
        email="b@u.gh",
        phone=None,
        role="Teacher",
        school_id=str(SCHOOL_UUID),
        linked_id=str(me.id),
    )
    with pytest.raises(ForbiddenError):
        await StaffService.update(
            db_session,
            SCHOOL_UUID,
            other.id,
            StaffUpdate(photo_url="https://cdn.example/x.png"),
            user=teacher,
            supabase=_FakeSupabase(),
        )


async def test_update_teacher_cannot_patch_other_fields_on_own_row(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    teacher = CurrentUser(
        user_id=str(USER_UUID),
        email="t@u.gh",
        phone=None,
        role="Teacher",
        school_id=str(SCHOOL_UUID),
        linked_id=str(row.id),
    )
    with pytest.raises(ForbiddenError):
        await StaffService.update(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUpdate(first_name="Renamed"),
            user=teacher,
            supabase=_FakeSupabase(),
        )


async def test_update_parent_cannot_patch_anything(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    parent = CurrentUser(
        user_id=str(USER_UUID),
        email="p@u.gh",
        phone=None,
        role="Parent",
        school_id=str(SCHOOL_UUID),
        linked_id=str(row.id),
    )
    with pytest.raises(ForbiddenError):
        await StaffService.update(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUpdate(photo_url="https://cdn.example/p.png"),
            user=parent,
            supabase=_FakeSupabase(),
        )


async def test_change_role_writes_audit_row(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Admin"),
        supabase=_FakeSupabase(),
        actor_user_id=USER_UUID,
    )

    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "ROLE_CHANGE")))
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    # `before` / `after` are JSONB (see migration 63bbd48d03f4) — they
    # come back as plain dicts.
    assert audit_rows[0].before == {"systemRole": "Teacher"}
    assert audit_rows[0].after == {"systemRole": "Admin"}


async def test_change_role_skips_audit_when_unchanged(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Teacher", division="JHS"),
        supabase=_FakeSupabase(),
        actor_user_id=USER_UUID,
    )
    audit_count = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "ROLE_CHANGE")))
        .scalars()
        .all()
    )
    assert len(audit_count) == 0


async def test_change_role_to_admin_clears_division(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="Admin"),
        supabase=_FakeSupabase(),
        actor_user_id=USER_UUID,
    )
    assert updated.division is None


async def test_change_role_syncs_linked_login_role_and_jwt(
    db_session: AsyncSession, seed_school: School
) -> None:
    """The staff row's system_role changing must also update the
    linked login's `users.role` and Supabase `app_metadata.role` — the
    JWT is what actually gates access, not `staff.system_role`."""
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    login = User(
        id=uuid4(),
        school_id=SCHOOL_UUID,
        email=row.email,
        role="Teacher",
        linked_id=row.id,
        is_active=True,
    )
    db_session.add(login)
    await db_session.flush()

    fake = _FakeSupabase()
    await StaffService.change_role(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffRoleChange(system_role="DeputyHead", division="JHS"),
        supabase=fake,
        actor_user_id=USER_UUID,
    )

    await db_session.refresh(login)
    assert login.role == "DeputyHead"
    assert len(fake.update_calls) == 1
    call = fake.update_calls[0]
    assert call["user_id"] == login.id
    assert call["app_metadata"]["role"] == "DeputyHead"
    assert call["app_metadata"]["linked_id"] == str(row.id)


async def test_toggle_unit_head_requires_teacher_role(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(
        db_session,
        SCHOOL_UUID,
        _create_payload(system_role="DeputyHead"),
    )
    with pytest.raises(ValidationError):
        await StaffService.toggle_unit_head(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUnitHeadToggle(is_unit_head=True, unit_head_of="JHS"),
            actor_user_id=USER_UUID,
        )


async def test_toggle_unit_head_requires_unit_when_enabling(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    with pytest.raises(ValidationError):
        await StaffService.toggle_unit_head(
            db_session,
            SCHOOL_UUID,
            row.id,
            StaffUnitHeadToggle(is_unit_head=True),
            actor_user_id=USER_UUID,
        )


async def test_toggle_unit_head_writes_audit_row(
    db_session: AsyncSession, seed_school: School
) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.toggle_unit_head(
        db_session,
        SCHOOL_UUID,
        row.id,
        StaffUnitHeadToggle(is_unit_head=True, unit_head_of="JHS"),
        actor_user_id=USER_UUID,
    )
    assert updated.is_unit_head is True

    audit_row = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "UNIT_HEAD_TOGGLED", AuditLog.target_id == row.id
            )
        )
    ).scalar_one()
    assert audit_row.before == {"isUnitHead": False, "unitHeadOf": None}
    assert audit_row.after == {"isUnitHead": True, "unitHeadOf": "JHS"}


async def test_set_active_toggles(db_session: AsyncSession, seed_school: School) -> None:
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    updated = await StaffService.set_active(
        db_session,
        SCHOOL_UUID,
        row.id,
        active=False,
        supabase=_FakeSupabase(),
        actor_user_id=USER_UUID,
    )
    assert updated.is_active is False

    audit_row = (
        await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "STAFF_DEACTIVATED", AuditLog.target_id == row.id
            )
        )
    ).scalar_one()
    assert audit_row.before == {"isActive": True}
    assert audit_row.after == {"isActive": False}

    with pytest.raises(ConflictError):
        # Already inactive — second call should error.
        await StaffService.set_active(
            db_session,
            SCHOOL_UUID,
            row.id,
            active=False,
            supabase=_FakeSupabase(),
            actor_user_id=USER_UUID,
        )


async def test_set_active_revokes_linked_login(
    db_session: AsyncSession, seed_school: School
) -> None:
    """Deactivating a staff member with a linked login must also
    deactivate that `users` row (and thus ban them in Supabase) — this
    is the actual enforcement mechanism; `staff.is_active` alone was
    never consulted anywhere."""
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    login = User(
        id=uuid4(),
        school_id=SCHOOL_UUID,
        email=row.email,
        role="Teacher",
        linked_id=row.id,
        is_active=True,
    )
    db_session.add(login)
    await db_session.flush()

    fake = _FakeSupabase()
    await StaffService.set_active(
        db_session, SCHOOL_UUID, row.id, active=False, supabase=fake, actor_user_id=USER_UUID
    )

    await db_session.refresh(login)
    assert login.is_active is False
    assert len(fake.update_calls) == 1
    assert fake.update_calls[0]["user_id"] == login.id


async def test_set_active_skips_linked_login_step_when_no_login_exists(
    db_session: AsyncSession, seed_school: School
) -> None:
    """A staff row with no linked `users` row (login not provisioned
    yet) just skips the cascade — nothing to revoke."""
    row = await StaffService.create(db_session, SCHOOL_UUID, _create_payload())
    fake = _FakeSupabase()
    updated = await StaffService.set_active(
        db_session, SCHOOL_UUID, row.id, active=False, supabase=fake, actor_user_id=USER_UUID
    )
    assert updated.is_active is False
    assert fake.update_calls == []


async def test_get_raises_not_found_for_missing_id(
    db_session: AsyncSession, seed_school: School
) -> None:
    from uuid import uuid4

    with pytest.raises(NotFoundError):
        await StaffService.get(db_session, SCHOOL_UUID, uuid4())
