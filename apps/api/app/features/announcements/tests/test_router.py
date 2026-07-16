"""Router tests for the Announcements API.

Coverage groups:
  1. Create — role gates per audience type (all / division / class)
  2. List — role-filtered visibility (incl. `:staff`-suffixed audiences)
  3. Notification fan-out on post (integration with NotificationsService)
  4. Notification fan-out — email/SMS channels
  5. Delete — author + Admin only
"""

from __future__ import annotations

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.announcements.tests.conftest import (
    ADMIN_USER,
    CLASS_JHS1_UUID,
    DEPUTY_JHS_STAFF,
    DEPUTY_JHS_USER,
    DEPUTY_KG_STAFF,
    DEPUTY_KG_USER,
    GUARDIAN_UUID,
    PARENT_USER,
    SCHOOL_UUID,
    TEACHER_JHS_STAFF,
    TEACHER_JHS_USER,
    auth_header,
)
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.users.model import UserPreferences

pytestmark = pytest.mark.asyncio


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


@pytest_asyncio.fixture
async def seed_prefs(db_session: AsyncSession) -> None:
    """One `UserPreferences` row per seeded user, all channels on by
    default — individual tests flip a field to `False` to test opt-out."""
    db_session.add_all(
        [
            UserPreferences(user_id=ADMIN_USER),
            UserPreferences(user_id=DEPUTY_JHS_USER),
            UserPreferences(user_id=DEPUTY_KG_USER),
            UserPreferences(user_id=TEACHER_JHS_USER),
            UserPreferences(user_id=PARENT_USER),
        ]
    )
    await db_session.flush()


# ─── Create role gates ──────────────────────────────────────────────────────


async def test_admin_can_post_school_wide(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "School closed Friday",
            "body": "Details inside.",
            "audience": "all",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text
    assert res.json()["audience"] == "all"


async def test_deputy_cannot_post_school_wide(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={"title": "x", "body": "y", "audience": "all", "isCritical": False},
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    # ConflictError → 409 (not 403 — matches the TS ActionResult{success:false}
    # error path where "you can't do this" is a domain-level failure).
    assert res.status_code == 409


async def test_deputy_posts_own_division_ok(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "JHS assembly",
            "body": "Details.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert res.status_code == 201, res.text


async def test_deputy_cannot_post_other_division(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "JHS assembly",
            "body": "Details.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_KG_USER, linked_id=DEPUTY_KG_STAFF),
    )
    assert res.status_code == 409


async def test_teacher_cannot_post_class(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "test",
            "body": "test",
            "audience": f"class:{CLASS_JHS1_UUID}",
            "isCritical": False,
        },
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    assert res.status_code == 409


# ─── List visibility ────────────────────────────────────────────────────────


async def _post_all(client: AsyncClient) -> None:
    await client.post(
        "/announcements",
        json={"title": "all", "body": "all", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )


async def _post_division(client: AsyncClient, division: str) -> None:
    await client.post(
        "/announcements",
        json={
            "title": f"div-{division}",
            "body": "x",
            "audience": f"division:{division}",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )


async def test_teacher_sees_all_and_own_division(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-JHS"}


async def test_deputy_kg_only_sees_own_division_and_all(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_KG_USER, linked_id=DEPUTY_KG_STAFF),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-KG"}


async def test_parent_sees_all_and_child_division(client: AsyncClient, seed: None) -> None:
    """The seeded parent has a JHS 1 kid → they see `all` + `division:JHS`
    but not `division:KG`."""
    _ = seed
    await _post_all(client)
    await _post_division(client, "JHS")
    await _post_division(client, "KG")

    res = await client.get(
        "/announcements",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    titles = {a["title"] for a in res.json()["items"]}
    assert titles == {"all", "div-JHS"}


async def test_staff_only_all_is_invisible_to_parents(client: AsyncClient, seed: None) -> None:
    """`all:staff` is a real visibility distinction, not just a
    notification-channel filter — parents must never see it in their
    feed, even though it's still school-wide for staff."""
    _ = seed
    await client.post(
        "/announcements",
        json={"title": "Staff meeting", "body": "x", "audience": "all:staff", "isCritical": False},
        headers=auth_header(role="Admin"),
    )

    parent_res = await client.get(
        "/announcements",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    assert "Staff meeting" not in {a["title"] for a in parent_res.json()["items"]}

    teacher_res = await client.get(
        "/announcements",
        headers=auth_header(role="Teacher", user_id=TEACHER_JHS_USER, linked_id=TEACHER_JHS_STAFF),
    )
    assert "Staff meeting" in {a["title"] for a in teacher_res.json()["items"]}


async def test_staff_only_division_is_invisible_to_parents(client: AsyncClient, seed: None) -> None:
    _ = seed
    await client.post(
        "/announcements",
        json={
            "title": "JHS staff briefing",
            "body": "x",
            "audience": "division:JHS:staff",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )

    parent_res = await client.get(
        "/announcements",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    assert "JHS staff briefing" not in {a["title"] for a in parent_res.json()["items"]}

    deputy_res = await client.get(
        "/announcements",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_JHS_USER, linked_id=DEPUTY_JHS_STAFF),
    )
    assert "JHS staff briefing" in {a["title"] for a in deputy_res.json()["items"]}


# ─── Notification fan-out on post ───────────────────────────────────────────


async def test_school_wide_post_notifies_school(client: AsyncClient, seed: None) -> None:
    """Post a school-wide announcement; parent's bell should show it."""
    _ = seed
    res = await client.post(
        "/announcements",
        json={
            "title": "School closed",
            "body": "Public holiday.",
            "audience": "all",
            "isCritical": True,
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    body = bell.json()
    assert body["unreadCount"] >= 1
    # `⚠` prefix comes from is_critical.
    assert any("School closed" in item["title"] for item in body["items"])


async def test_division_post_notifies_staff_and_parents(client: AsyncClient, seed: None) -> None:
    """`division:JHS` should reach the JHS Deputy + parents of JHS
    students — the KG Deputy should NOT see it."""
    _ = seed
    await client.post(
        "/announcements",
        json={
            "title": "JHS PTA",
            "body": "Come.",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )

    jhs_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert any(item["title"] == "JHS PTA" for item in jhs_bell.json()["items"])

    parent_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=PARENT_USER, linked_id=GUARDIAN_UUID),
    )
    assert any(item["title"] == "JHS PTA" for item in parent_bell.json()["items"])

    kg_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_KG_USER,
            linked_id=DEPUTY_KG_STAFF,
        ),
    )
    assert not any(item["title"] == "JHS PTA" for item in kg_bell.json()["items"])


# ─── Notification fan-out — email/SMS channels ─────────────────────────────


async def test_school_wide_post_emails_every_recipient(
    client: AsyncClient,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = (seed, seed_prefs)
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={"title": "School closed", "body": "Storm.", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )

    events = _events_named(fake_send, "email/announcement-posted.requested")
    recipients = {dict(e.data)["recipient_email"] for e in events}
    assert recipients == {
        "admin@anc.test",
        "dh-jhs@anc.test",
        "dh-kg@anc.test",
        "t@anc.test",
        "parent@anc.test",
    }


async def test_staff_only_post_does_not_email_parent(
    client: AsyncClient,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = (seed, seed_prefs)
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={"title": "Staff memo", "body": "x", "audience": "all:staff", "isCritical": False},
        headers=auth_header(role="Admin"),
    )

    events = _events_named(fake_send, "email/announcement-posted.requested")
    recipients = {dict(e.data)["recipient_email"] for e in events}
    assert "parent@anc.test" not in recipients
    assert recipients == {"admin@anc.test", "dh-jhs@anc.test", "dh-kg@anc.test", "t@anc.test"}


async def test_division_post_batches_staff_and_parent_sms_separately(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`division:JHS` (non-staff-only) resolves staff and parents as two
    separate audience specs — each gets its own batched
    `sms/fanout.requested` event, not one merged event."""
    _ = (seed, seed_prefs)
    deputy_staff = await db_session.get(Staff, DEPUTY_JHS_STAFF)
    assert deputy_staff is not None
    deputy_staff.phone = "+233200000901"
    guardian = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian is not None
    guardian.phone = "+233200000902"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={
            "title": "JHS PTA",
            "body": "x",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(role="Admin"),
    )

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 2
    recipients_per_event = [dict(e.data)["recipients"] for e in sms_events]
    assert [{"phone": "+233200000901", "guardian_id": None}] in recipients_per_event
    assert [{"phone": "+233200000902", "guardian_id": str(GUARDIAN_UUID)}] in recipients_per_event
    for e in sms_events:
        assert dict(e.data)["category"] == "announcement"


async def test_critical_post_bypasses_recipient_opt_out(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = (seed, seed_prefs)
    prefs = await db_session.get(UserPreferences, ADMIN_USER)
    assert prefs is not None
    prefs.email_on_announcement_posted = False
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={"title": "Evacuate now", "body": "x", "audience": "all", "isCritical": True},
        headers=auth_header(role="Admin"),
    )

    events = _events_named(fake_send, "email/announcement-posted.requested")
    recipients = {dict(e.data)["recipient_email"] for e in events}
    assert "admin@anc.test" in recipients


async def test_school_toggle_off_suppresses_even_critical_post(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The school-level `notification_defaults.on_announcement_posted`
    gate is checked once upstream of the whole fan-out — `is_critical`
    only bypasses a recipient's own preference, never this switch."""
    _ = (seed, seed_prefs)
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_announcement_posted": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={"title": "Evacuate now", "body": "x", "audience": "all", "isCritical": True},
        headers=auth_header(role="Admin"),
    )

    assert fake_send.events == []


async def test_non_critical_post_respects_independent_channel_opt_out(
    client: AsyncClient,
    db_session: AsyncSession,
    seed: None,
    seed_prefs: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = (seed, seed_prefs)
    guardian = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian is not None
    guardian.phone = "+233200000903"
    prefs = await db_session.get(UserPreferences, PARENT_USER)
    assert prefs is not None
    prefs.email_on_announcement_posted = False
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await client.post(
        "/announcements",
        json={"title": "Fun fair", "body": "x", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )

    email_events = _events_named(fake_send, "email/announcement-posted.requested")
    assert "parent@anc.test" not in {dict(e.data)["recipient_email"] for e in email_events}

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    recipients_per_event = [dict(e.data)["recipients"] for e in sms_events]
    assert [{"phone": "+233200000903", "guardian_id": str(GUARDIAN_UUID)}] in recipients_per_event


# ─── Delete ─────────────────────────────────────────────────────────────────


async def test_admin_can_delete_any(client: AsyncClient, seed: None) -> None:
    _ = seed
    create = await client.post(
        "/announcements",
        json={
            "title": "By DH",
            "body": "x",
            "audience": "division:JHS",
            "isCritical": False,
        },
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    ann_id = create.json()["id"]

    delete = await client.delete(
        f"/announcements/{ann_id}",
        headers=auth_header(role="Admin", user_id=ADMIN_USER),
    )
    assert delete.status_code == 204


async def test_non_author_non_admin_cannot_delete(client: AsyncClient, seed: None) -> None:
    _ = seed
    create = await client.post(
        "/announcements",
        json={"title": "By Admin", "body": "x", "audience": "all", "isCritical": False},
        headers=auth_header(role="Admin"),
    )
    ann_id = create.json()["id"]

    delete = await client.delete(
        f"/announcements/{ann_id}",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert delete.status_code == 403
