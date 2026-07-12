"""Tests for `GET /me`.

Covers every resolution branch — Admin (linked staff), Teacher unit
head (populates division), Parent (guardian branch), and the email
fallback for a user without a linked row. Also asserts the 401/403
gates so a broken JWT can never reach the composition logic.
"""

from __future__ import annotations

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.guardians.model import Guardian
from app.features.me.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    EMAIL_ONLY_USER,
    GUARDIAN_ID,
    PARENT_USER,
    TEACHER_STAFF,
    TEACHER_USER,
    FakeSupabaseAdminClient,
    auth_header,
)
from app.features.staff.model import Staff
from app.features.users.model import User, UserPreferences
from app.features.users.supabase_admin import PERMANENT_BAN


async def test_get_me_admin_linked_staff(client: AsyncClient, seed: None) -> None:
    r = await client.get("/me", headers=auth_header())
    assert r.status_code == 200
    body = r.json()
    assert body["uid"] == str(ADMIN_USER)
    assert body["role"] == "Admin"
    assert body["linkedId"] == str(ADMIN_STAFF)
    assert body["slug"] == "STAFF-adm-me"
    assert body["displayName"] == "Adae Admin"
    assert body["email"] == "admin@me.test"
    assert body["isActive"] is True
    assert body["isUnitHead"] is False
    assert body["unitHeadOf"] is None
    assert body["mustChangePassword"] is False
    # No user_preferences row yet — defaults to true, not "opted out".
    assert body["emailOnLessonPlanRejected"] is True


async def test_get_me_teacher_unit_head(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_USER,
            linked_id=TEACHER_STAFF,
            email="t@me.test",
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "Teacher"
    assert body["slug"] == "STAFF-t-me"
    assert body["displayName"] == "Ama Teacher"
    assert body["isUnitHead"] is True
    assert body["unitHeadOf"] == "JHS"


async def test_get_me_parent_linked_guardian(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Parent",
            user_id=PARENT_USER,
            linked_id=GUARDIAN_ID,
            email="p@me.test",
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "Parent"
    assert body["linkedId"] == str(GUARDIAN_ID)
    assert body["slug"] == "GUAR-p-me"
    assert body["displayName"] == "Paa Parent"
    # Parents never get unit-head fields — even if the branch runs.
    assert body["isUnitHead"] is False


async def test_get_me_email_fallback_when_no_linked_row(client: AsyncClient, seed: None) -> None:
    r = await client.get(
        "/me",
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
            must_change_password=True,
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["linkedId"] is None
    assert body["slug"] is None
    # No linked staff → fall through to the JWT email.
    assert body["displayName"] == "fallback@me.test"
    assert body["mustChangePassword"] is True


async def test_get_me_missing_auth_header_returns_401(client: AsyncClient, seed: None) -> None:
    r = await client.get("/me")
    assert r.status_code == 401


async def test_get_me_jwt_without_role_is_forbidden(client: AsyncClient, seed: None) -> None:
    # Empty role field slips past the JWT verify but the service
    # rejects it — a half-provisioned account has no dashboard yet.
    import time
    from uuid import UUID

    import jwt

    from app.core.config import settings

    now = int(time.time())
    token = jwt.encode(
        {
            "sub": str(UUID(int=0)),
            "iat": now,
            "exp": now + 3600,
            "email": "half@me.test",
            "app_metadata": {},
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    r = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


# ─── PATCH /me ───────────────────────────────────────────────────────────────


async def test_patch_me_updates_staff_row_and_syncs_supabase(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Kojo Newname"},
        headers=auth_header(),
    )
    assert res.status_code == 200, res.text
    assert res.json()["displayName"] == "Kojo Newname"

    staff = await db_session.scalar(select(Staff).where(Staff.id == ADMIN_STAFF))
    assert staff is not None
    assert staff.first_name == "Kojo"
    assert staff.last_name == "Newname"

    assert len(fake_supabase.update_calls) == 1
    assert fake_supabase.update_calls[0]["user_id"] == ADMIN_USER
    assert fake_supabase.update_calls[0]["user_metadata"] == {"display_name": "Kojo Newname"}


async def test_patch_me_updates_guardian_row_for_parent(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Paa Newlast"},
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 200, res.text

    guardian = await db_session.scalar(select(Guardian).where(Guardian.id == GUARDIAN_ID))
    assert guardian is not None
    assert guardian.first_name == "Paa"
    assert guardian.last_name == "Newlast"


async def test_patch_me_without_linked_id_returns_400(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me",
        json={"displayName": "Nobody"},
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
        ),
    )
    assert res.status_code == 400


async def test_patch_me_missing_auth_header_returns_401(client: AsyncClient, seed: None) -> None:
    res = await client.patch("/me", json={"displayName": "X"})
    assert res.status_code == 401


# ─── POST /me/phone/confirm ───────────────────────────────────────────────────


async def test_confirm_phone_mirrors_supabase_into_staff_row(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    fake_supabase.phone_by_user_id[str(ADMIN_USER)] = "+233244000111"

    res = await client.post("/me/phone/confirm", headers=auth_header())
    assert res.status_code == 200, res.text
    assert res.json()["phone"] == "+233244000111"

    staff = await db_session.scalar(select(Staff).where(Staff.id == ADMIN_STAFF))
    assert staff is not None
    assert staff.phone == "+233244000111"
    assert staff.first_name == "Adae"  # untouched


async def test_confirm_phone_mirrors_supabase_into_guardian_row(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    fake_supabase.phone_by_user_id[str(PARENT_USER)] = "0244000222"

    res = await client.post(
        "/me/phone/confirm",
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 200, res.text
    assert res.json()["phone"] == "+233244000222"

    guardian = await db_session.scalar(select(Guardian).where(Guardian.id == GUARDIAN_ID))
    assert guardian is not None
    assert guardian.phone == "+233244000222"


async def test_confirm_phone_without_confirmed_number_returns_400(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/me/phone/confirm", headers=auth_header())
    assert res.status_code == 400


async def test_confirm_phone_duplicate_guardian_phone_returns_409(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    other_guardian = Guardian(
        id=UUID("10101010-1010-4101-8101-101010100305"),
        slug="GUAR-other-me",
        school_id=UUID("10101010-1010-4101-8101-101010100001"),
        first_name="Kwesi",
        last_name="Other",
        email="other@me.test",
        phone="+233244999999",
    )
    db_session.add(other_guardian)
    await db_session.flush()

    fake_supabase.phone_by_user_id[str(PARENT_USER)] = "+233244999999"
    res = await client.post(
        "/me/phone/confirm",
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 409


async def test_confirm_phone_without_linked_id_returns_400(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    fake_supabase.phone_by_user_id[str(EMAIL_ONLY_USER)] = "+233244000444"
    res = await client.post(
        "/me/phone/confirm",
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
        ),
    )
    assert res.status_code == 400


async def test_confirm_phone_missing_auth_header_returns_401(
    client: AsyncClient, seed: None
) -> None:
    res = await client.post("/me/phone/confirm")
    assert res.status_code == 401


# ─── POST /me/email/confirm ───────────────────────────────────────────────────


async def test_confirm_email_mirrors_supabase_into_users_and_staff_row(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    fake_supabase.email_by_user_id[str(ADMIN_USER)] = "new-admin@uhas.edu.gh"

    res = await client.post("/me/email/confirm", headers=auth_header())
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "new-admin@uhas.edu.gh"

    user_row = await db_session.scalar(select(User).where(User.id == ADMIN_USER))
    assert user_row is not None
    assert user_row.email == "new-admin@uhas.edu.gh"

    staff = await db_session.scalar(select(Staff).where(Staff.id == ADMIN_STAFF))
    assert staff is not None
    assert staff.email == "new-admin@uhas.edu.gh"
    assert staff.first_name == "Adae"  # untouched


async def test_confirm_email_mirrors_supabase_into_guardian_row(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    fake_supabase.email_by_user_id[str(PARENT_USER)] = "new-parent@example.com"

    res = await client.post(
        "/me/email/confirm",
        headers=auth_header(
            role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_ID, email="p@me.test"
        ),
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "new-parent@example.com"

    guardian = await db_session.scalar(select(Guardian).where(Guardian.id == GUARDIAN_ID))
    assert guardian is not None
    assert guardian.email == "new-parent@example.com"


async def test_confirm_email_works_without_a_linked_record(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """Unlike phone (which lives only on the linked staff/guardian row),
    email's source of truth is `users.email` — syncing it doesn't
    require a linked domain record."""
    fake_supabase.email_by_user_id[str(EMAIL_ONLY_USER)] = "new-fallback@example.com"
    res = await client.post(
        "/me/email/confirm",
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
        ),
    )
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "new-fallback@example.com"

    user_row = await db_session.scalar(select(User).where(User.id == EMAIL_ONLY_USER))
    assert user_row is not None
    assert user_row.email == "new-fallback@example.com"


async def test_confirm_email_without_confirmed_address_returns_400(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/me/email/confirm", headers=auth_header())
    assert res.status_code == 400


async def test_confirm_email_missing_auth_header_returns_401(
    client: AsyncClient, seed: None
) -> None:
    res = await client.post("/me/email/confirm")
    assert res.status_code == 401


# ─── PATCH /me — notification preferences ───────────────────────────────────


async def test_patch_me_creates_preferences_row_on_first_write(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.patch(
        "/me", json={"emailOnLessonPlanRejected": False}, headers=auth_header()
    )
    assert res.status_code == 200, res.text
    assert res.json()["emailOnLessonPlanRejected"] is False

    prefs = await db_session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == ADMIN_USER)
    )
    assert prefs is not None
    assert prefs.email_on_lesson_plan_rejected is False


async def test_patch_me_updates_existing_preferences_row(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    db_session.add(UserPreferences(user_id=ADMIN_USER, email_on_lesson_plan_rejected=False))
    await db_session.flush()

    res = await client.patch("/me", json={"emailOnLessonPlanRejected": True}, headers=auth_header())
    assert res.status_code == 200, res.text
    assert res.json()["emailOnLessonPlanRejected"] is True

    rows = (
        (
            await db_session.execute(
                select(UserPreferences).where(UserPreferences.user_id == ADMIN_USER)
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].email_on_lesson_plan_rejected is True


async def test_patch_me_updates_results_published_preference(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """`emailOnResultsPublished` — the parent-facing counterpart to
    `emailOnLessonPlanRejected`, exposed on `/me` for the first time
    alongside the appointment preferences."""
    res = await client.patch("/me", json={"emailOnResultsPublished": False}, headers=auth_header())
    assert res.status_code == 200, res.text
    assert res.json()["emailOnResultsPublished"] is False

    prefs = await db_session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == ADMIN_USER)
    )
    assert prefs is not None
    assert prefs.email_on_results_published is False


async def test_patch_me_updates_leave_preferences(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """The 4 leave-request preference fields (approver-facing
    "activity" + requester-facing "decided", each email/SMS)."""
    res = await client.patch(
        "/me",
        json={
            "emailOnLeaveActivity": False,
            "smsOnLeaveActivity": False,
            "emailOnLeaveDecided": False,
            "smsOnLeaveDecided": False,
        },
        headers=auth_header(),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["emailOnLeaveActivity"] is False
    assert body["smsOnLeaveActivity"] is False
    assert body["emailOnLeaveDecided"] is False
    assert body["smsOnLeaveDecided"] is False

    prefs = await db_session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == ADMIN_USER)
    )
    assert prefs is not None
    assert prefs.email_on_leave_activity is False
    assert prefs.sms_on_leave_activity is False
    assert prefs.email_on_leave_decided is False
    assert prefs.sms_on_leave_decided is False


async def test_patch_me_updates_attendance_preferences(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """The 2 attendance-absence preference fields — single-direction
    (parent-facing only), unlike appointments/leave's two directions."""
    res = await client.patch(
        "/me",
        json={"emailOnAttendanceAbsent": False, "smsOnAttendanceAbsent": False},
        headers=auth_header(),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["emailOnAttendanceAbsent"] is False
    assert body["smsOnAttendanceAbsent"] is False

    prefs = await db_session.scalar(
        select(UserPreferences).where(UserPreferences.user_id == ADMIN_USER)
    )
    assert prefs is not None
    assert prefs.email_on_attendance_absent is False
    assert prefs.sms_on_attendance_absent is False


async def test_patch_me_preferences_works_without_a_linked_row(
    client: AsyncClient,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """Unlike displayName/phone, this preference isn't tied to a linked
    staff/guardian row — it must work even for an account that has none."""
    res = await client.patch(
        "/me",
        json={"emailOnLessonPlanRejected": False},
        headers=auth_header(
            role="Admin",
            user_id=EMAIL_ONLY_USER,
            linked_id=None,
            email="fallback@me.test",
        ),
    )
    assert res.status_code == 200, res.text
    assert res.json()["emailOnLessonPlanRejected"] is False


# ─── POST /me/deactivate — self-service deactivation ────────────────────────


async def test_deactivate_me_flips_flag_bans_and_audits(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post(
        "/me/deactivate",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 204, res.text

    user = await db_session.get(User, TEACHER_USER)
    assert user is not None
    assert user.is_active is False

    # Supabase ban issued for the caller's own uid, permanent duration.
    assert len(fake_supabase.update_calls) == 1
    assert fake_supabase.update_calls[0]["user_id"] == TEACHER_USER
    assert fake_supabase.update_calls[0]["ban_duration"] == PERMANENT_BAN

    audit = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "ACCOUNT_SELF_DEACTIVATED", AuditLog.target_id == TEACHER_USER
        )
    )
    assert audit is not None
    assert audit.user_id == TEACHER_USER
    assert audit.target_id == TEACHER_USER
    assert audit.after == {"isActive": False}


async def test_deactivate_me_admin_is_forbidden(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    res = await client.post("/me/deactivate", headers=auth_header())  # Admin
    assert res.status_code == 403

    user = await db_session.get(User, ADMIN_USER)
    assert user is not None
    assert user.is_active is True  # unchanged
    assert fake_supabase.update_calls == []  # no ban issued


async def test_deactivate_me_leaves_linked_staff_row_active(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    fake_supabase: FakeSupabaseAdminClient,
) -> None:
    """Deactivation flips the `users` bridge row only — the linked
    `staff.is_active` stays as-is, mirroring admin-side deactivation."""
    res = await client.post(
        "/me/deactivate",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 204, res.text

    staff = await db_session.get(Staff, TEACHER_STAFF)
    assert staff is not None
    assert staff.is_active is True


async def test_deactivate_me_requires_auth(client: AsyncClient, seed: None) -> None:
    res = await client.post("/me/deactivate")
    assert res.status_code == 401
