"""Tests for the leave-requests email + SMS fan-out
(`_notify_leave_approvers` / `_notify_leave_requester`) — the two-tier
gate, the multi-recipient approver resolution (every Deputy Head of
the requester's division + every Admin), and the explicit absence of
any notification on cancel or substitute-assignment (out of scope by
design, see `docs/superpowers/specs/2026-07-12-leave-request-notifications-design.md`).

Monkeypatches `inngest_client.send` rather than requiring a live
Inngest dev server — same approach as
`appointments/tests/test_notifications.py`.
"""

from __future__ import annotations

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.leave_requests.tests.conftest import (
    SCHOOL_UUID,
    STAFF_ADMIN_UUID,
    STAFF_APPROVER_UUID,
    STAFF_OTHER_DEPUTY_UUID,
    STAFF_OTHER_DIVISION_UUID,
    STAFF_REQUESTER_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.users.model import User, UserPreferences

pytestmark = pytest.mark.asyncio

REQUESTER_USER = "cccccccc-cccc-4ccc-8ccc-ccccccccc101"
DEPUTY_USER = "cccccccc-cccc-4ccc-8ccc-ccccccccc102"
ADMIN_USER = "cccccccc-cccc-4ccc-8ccc-ccccccccc103"
OTHER_DEPUTY_USER = "cccccccc-cccc-4ccc-8ccc-ccccccccc104"


@pytest_asyncio.fixture
async def seed_users(
    db_session: AsyncSession, seed_staff: tuple[Staff, Staff, Staff]
) -> tuple[User, User, User, User]:
    """`users` bridge rows for the requester, the in-division Deputy
    Head, the Admin, and the other-division Deputy Head — without
    these, `resolve_audience`/`find_user_for_linked` return nothing
    and the whole notification branch (in-app + email + SMS)
    short-circuits before reaching our code."""
    requester = User(
        id=REQUESTER_USER,
        school_id=SCHOOL_UUID,
        email="ama@leave-notif.test",
        role="Teacher",
        linked_id=STAFF_REQUESTER_UUID,
        is_active=True,
    )
    deputy = User(
        id=DEPUTY_USER,
        school_id=SCHOOL_UUID,
        email="deputy@leave-notif.test",
        role="DeputyHead",
        linked_id=STAFF_APPROVER_UUID,
        is_active=True,
    )
    admin = User(
        id=ADMIN_USER,
        school_id=SCHOOL_UUID,
        email="admin@leave-notif.test",
        role="Admin",
        linked_id=STAFF_ADMIN_UUID,
        is_active=True,
    )
    other_deputy = User(
        id=OTHER_DEPUTY_USER,
        school_id=SCHOOL_UUID,
        email="other-deputy@leave-notif.test",
        role="DeputyHead",
        linked_id=STAFF_OTHER_DEPUTY_UUID,
        is_active=True,
    )
    db_session.add_all([requester, deputy, admin, other_deputy])
    await db_session.flush()
    return requester, deputy, admin, other_deputy


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


def _payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "type": "Casual",
        "startDate": "2026-02-10",
        "endDate": "2026-02-12",
        "reason": "Family event",
    }
    body.update(overrides)
    return body


async def _create_leave_request(client: AsyncClient) -> str:
    res = await client.post("/leave-requests", json=_payload(), headers=auth_header(role="Teacher"))
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


# ─── create() — notifies every eligible approver ───────────────────────────


async def test_create_notifies_deputy_head_and_admin_in_app(
    client: AsyncClient,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    await _create_leave_request(client)

    deputy_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert any(n["kind"] == "leave_request_submitted" for n in deputy_bell.json()["items"])

    admin_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=STAFF_ADMIN_UUID),
    )
    assert any(n["kind"] == "leave_request_submitted" for n in admin_bell.json()["items"])


async def test_create_does_not_notify_other_division_deputy(
    client: AsyncClient,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    await _create_leave_request(client)

    other_deputy_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(
            role="DeputyHead", user_id=OTHER_DEPUTY_USER, linked_id=STAFF_OTHER_DEPUTY_UUID
        ),
    )
    assert other_deputy_bell.json()["unreadCount"] == 0


async def test_create_notifies_admin_even_with_no_deputy_in_division(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    """The requester's own division has a Deputy Head in this fixture
    set (STAFF_APPROVER_UUID) — reassign the requester to the
    no-deputy division to prove Admin still gets notified alone."""
    _ = seed_staff
    requester_staff = await db_session.get(Staff, STAFF_REQUESTER_UUID)
    assert requester_staff is not None
    requester_staff.division = "Upper Primary"
    await db_session.flush()

    await _create_leave_request(client)

    admin_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=STAFF_ADMIN_UUID),
    )
    assert any(n["kind"] == "leave_request_submitted" for n in admin_bell.json()["items"])


async def test_create_email_events_carry_role_scoped_links(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_leave_request(client)

    events = _events_named(fake_send, "email/leave-requested.requested")
    assert len(events) == 2  # deputy + admin

    by_recipient = {dict(e.data)["approver_email"]: dict(e.data) for e in events}
    deputy_data = by_recipient["deputy@leave-notif.test"]
    assert deputy_data["link"] == "/deputy-head/leave"
    assert deputy_data["preferences_link"] == "/deputy-head/profile?tab=notifications"
    assert deputy_data["requester_name"] == "Ama Owusu"
    assert deputy_data["school_name"] == "Test School (leave)"

    admin_data = by_recipient["admin@leave-notif.test"]
    assert admin_data["link"] == "/admin/staff"
    assert admin_data["preferences_link"] == "/admin/profile?tab=notifications"


async def test_create_emits_sms_when_approver_has_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    deputy_staff = await db_session.get(Staff, STAFF_APPROVER_UUID)
    assert deputy_staff is not None
    deputy_staff.phone = "+233200000401"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_leave_request(client)

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 1
    data = dict(sms_events[0].data)
    assert data["category"] == "leave"
    assert data["recipients"] == [{"phone": "+233200000401", "guardian_id": None}]


async def test_create_skips_both_channels_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_leave_activity": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_leave_request(client)

    assert fake_send.events == []


async def test_create_skips_email_only_when_approver_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    deputy_staff = await db_session.get(Staff, STAFF_APPROVER_UUID)
    assert deputy_staff is not None
    deputy_staff.phone = "+233200000401"
    db_session.add(UserPreferences(user_id=DEPUTY_USER, email_on_leave_activity=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_leave_request(client)

    events = _events_named(fake_send, "email/leave-requested.requested")
    assert len(events) == 1  # admin only — deputy's email suppressed
    assert dict(events[0].data)["approver_email"] == "admin@leave-notif.test"
    # Deputy's SMS still allowed — independent per-channel toggle.
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


# ─── update_status() — approve/reject notifies the requester ──────────────


async def test_approve_notifies_requester_in_app_and_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    request_id = await _create_leave_request(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert res.status_code == 200

    events = _events_named(fake_send, "email/leave-decided.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["requester_email"] == "ama@leave-notif.test"
    assert data["action"] == "approved"
    assert data["link"] == "/teacher/leave"
    assert data["preferences_link"] == "/teacher/profile?tab=notifications"

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=REQUESTER_USER, linked_id=STAFF_REQUESTER_UUID),
    )
    assert any(
        n["kind"] == "leave_request_decided" and "approved" in n["title"]
        for n in bell.json()["items"]
    )


async def test_reject_email_carries_rejection_reason(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    request_id = await _create_leave_request(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "rejected", "rejectionReason": "Short-staffed that week"},
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert res.status_code == 200

    events = _events_named(fake_send, "email/leave-decided.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["action"] == "rejected"
    assert data["rejection_reason"] == "Short-staffed that week"


async def test_decide_skips_when_requester_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    _ = seed_staff
    db_session.add(UserPreferences(user_id=REQUESTER_USER, email_on_leave_decided=False))
    await db_session.flush()
    request_id = await _create_leave_request(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert res.status_code == 200
    assert _events_named(fake_send, "email/leave-decided.requested") == []


# ─── cancel / substitute-assignment — deliberately silent ─────────────────


async def test_cancel_emits_no_notification_of_any_kind(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    """Out of scope by design (see the PR3 spec) — cancel today emits
    nothing, same as before this PR."""
    _ = seed_staff
    request_id = await _create_leave_request(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "cancelled"},
        headers=auth_header(role="Teacher", user_id=REQUESTER_USER, linked_id=STAFF_REQUESTER_UUID),
    )
    assert res.status_code == 200
    assert fake_send.events == []

    deputy_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert not any(n["kind"] == "leave_request_cancelled" for n in deputy_bell.json()["items"])


async def test_substitute_assignment_emits_no_notification(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User, User],
    seed_staff: tuple[Staff, Staff, Staff],
) -> None:
    """Out of scope by design — the assigned substitute isn't told."""
    _ = seed_staff
    request_id = await _create_leave_request(client)
    await client.patch(
        f"/leave-requests/{request_id}",
        json={"status": "approved"},
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.patch(
        f"/leave-requests/{request_id}/substitute",
        json={"substituteStaffId": str(STAFF_OTHER_DIVISION_UUID)},
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=STAFF_APPROVER_UUID),
    )
    assert res.status_code == 200, res.text
    assert fake_send.events == []
