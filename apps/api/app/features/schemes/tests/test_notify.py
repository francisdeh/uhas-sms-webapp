"""Tests for the scheme email + SMS fan-out (`_notify_scheme_unit_heads`
/ `_notify_scheme_teacher`) — the two-tier gate, the Unit-Head-only
recipient resolution (no Admin/Deputy-Head fallback, a deliberate
scope decision — see the PR discussion), and the bidirectional
comment notification (teacher comments notify Unit Heads, a reviewer
comment notifies the teacher).

Monkeypatches `inngest_client.send` rather than requiring a live
Inngest dev server — same approach as
`leave_requests/tests/test_notifications.py`.
"""

from __future__ import annotations

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.classes.model import Class
from app.features.schemes.tests.conftest import (
    CLASS_UUID,
    DEPUTY_UUID,
    SCHOOL_UUID,
    SUBJECT_UUID,
    TEACHER_UUID,
    UNIT_HEAD_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.features.users.model import User, UserPreferences

pytestmark = pytest.mark.asyncio

TEACHER_USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0401"
UNIT_HEAD_USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0402"
DEPUTY_USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0403"


@pytest_asyncio.fixture
async def seed_users(
    db_session: AsyncSession,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
    seed_class: Class,
    seed_subject: Subject,
) -> tuple[User, User, User]:
    """`users` bridge rows for the teacher, the Unit Head, and the
    in-division Deputy Head — without these, `resolve_audience`/
    `find_user_for_linked` return nothing and the whole notification
    branch short-circuits before reaching our code. Also pulls in the
    class + subject rows every `_create_scheme` call needs."""
    _ = seed_class, seed_subject
    teacher = User(
        id=TEACHER_USER,
        school_id=SCHOOL_UUID,
        email="ama@scheme-notif.test",
        role="Teacher",
        linked_id=TEACHER_UUID,
        is_active=True,
    )
    unit_head = User(
        id=UNIT_HEAD_USER,
        school_id=SCHOOL_UUID,
        email="kojo@scheme-notif.test",
        role="Teacher",
        linked_id=UNIT_HEAD_UUID,
        is_active=True,
    )
    deputy = User(
        id=DEPUTY_USER,
        school_id=SCHOOL_UUID,
        email="yaa@scheme-notif.test",
        role="DeputyHead",
        linked_id=DEPUTY_UUID,
        is_active=True,
    )
    db_session.add_all([teacher, unit_head, deputy])
    await db_session.flush()
    return teacher, unit_head, deputy


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


async def _create_scheme(client: AsyncClient) -> str:
    res = await client.post(
        "/schemes",
        json={
            "subjectId": str(SUBJECT_UUID),
            "classId": str(CLASS_UUID),
            "type": "work",
            "term": 2,
            "academicYear": "2025/2026",
            "title": "Fractions scheme of work",
        },
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


async def _create_and_submit(client: AsyncClient) -> str:
    scheme_id = await _create_scheme(client)
    res = await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 200, res.text
    return scheme_id


# ─── submit() — notifies the Unit Head only ────────────────────────────────


async def test_submit_notifies_unit_head_in_app_and_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_submit(client)

    events = _events_named(fake_send, "email/scheme-submitted.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["recipient_email"] == "kojo@scheme-notif.test"
    assert data["teacher_name"] == "Ama Owusu"
    assert data["scheme_title"] == "Fractions scheme of work"
    assert data["class_name"] == "JHS 1"
    assert data["link"] == "/teacher/schemes"
    assert data["preferences_link"] == "/teacher/profile?tab=notifications"

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert any(n["kind"] == "scheme_submitted" for n in bell.json()["items"])


async def test_submit_does_not_notify_deputy_head(
    client: AsyncClient,
    seed_users: tuple[User, User, User],
) -> None:
    """No Admin/Deputy-Head fallback — a deliberate scope decision, not
    a bug. The in-division Deputy Head can still acknowledge a scheme
    manually, they just aren't proactively notified of the submission."""
    _ = seed_users
    await _create_and_submit(client)

    deputy_bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="DeputyHead", user_id=DEPUTY_USER, linked_id=DEPUTY_UUID),
    )
    assert deputy_bell.json()["unreadCount"] == 0


async def test_submit_emits_sms_when_unit_head_has_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    unit_head_staff = await db_session.get(Staff, UNIT_HEAD_UUID)
    assert unit_head_staff is not None
    unit_head_staff.phone = "+233200000701"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_submit(client)

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 1
    data = dict(sms_events[0].data)
    assert data["category"] == "scheme"
    assert data["recipients"] == [{"phone": "+233200000701", "guardian_id": None}]


async def test_no_unit_head_in_division_is_silent(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    """The division's only Unit Head demotes back to a regular teacher
    — submit must not error, just find zero recipients. The audience
    resolver keys off `unit_head_of` (not the `is_unit_head` flag), so
    clearing that field is what actually removes them from it."""
    _ = seed_users
    unit_head_staff = await db_session.get(Staff, UNIT_HEAD_UUID)
    assert unit_head_staff is not None
    unit_head_staff.unit_head_of = None
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_submit(client)

    assert fake_send.events == []


async def test_submit_skips_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_scheme_activity": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_submit(client)

    assert fake_send.events == []


async def test_submit_skips_email_only_when_unit_head_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    unit_head_staff = await db_session.get(Staff, UNIT_HEAD_UUID)
    assert unit_head_staff is not None
    unit_head_staff.phone = "+233200000701"
    db_session.add(UserPreferences(user_id=UNIT_HEAD_USER, email_on_scheme_activity=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_submit(client)

    assert _events_named(fake_send, "email/scheme-submitted.requested") == []
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


# ─── acknowledge() — notifies the submitting teacher ───────────────────────


async def test_acknowledge_notifies_teacher_in_app_and_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    scheme_id = await _create_and_submit(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={"comment": "Looks good"},
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert res.status_code == 200, res.text

    events = _events_named(fake_send, "email/scheme-acknowledged.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["recipient_email"] == "ama@scheme-notif.test"
    assert data["scheme_title"] == "Fractions scheme of work"
    assert data["comment"] == "Looks good"
    assert data["link"] == "/teacher/schemes"

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert any(n["kind"] == "scheme_acknowledged" for n in bell.json()["items"])


async def test_acknowledge_without_comment_has_empty_comment_field(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    scheme_id = await _create_and_submit(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert res.status_code == 200, res.text

    events = _events_named(fake_send, "email/scheme-acknowledged.requested")
    assert len(events) == 1
    assert dict(events[0].data)["comment"] == ""


async def test_acknowledge_skips_when_teacher_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    scheme_id = await _create_and_submit(client)
    db_session.add(UserPreferences(user_id=TEACHER_USER, email_on_scheme_decided=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    ack_res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert ack_res.status_code == 200, ack_res.text
    assert _events_named(fake_send, "email/scheme-acknowledged.requested") == []


# ─── add_comment() — bidirectional ─────────────────────────────────────────


async def test_teacher_comment_notifies_unit_head(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    scheme_id = await _create_and_submit(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/schemes/{scheme_id}/comments",
        json={"body": "Uploaded the missing week 3 content."},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201, res.text

    events = _events_named(fake_send, "email/scheme-commented.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["recipient_email"] == "kojo@scheme-notif.test"
    assert data["commenter_name"] == "Ama Owusu"
    assert data["comment"] == "Uploaded the missing week 3 content."

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert any(n["kind"] == "scheme_commented" for n in bell.json()["items"])


async def test_reviewer_comment_notifies_teacher(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_users: tuple[User, User, User],
) -> None:
    _ = seed_users
    scheme_id = await _create_and_submit(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/schemes/{scheme_id}/comments",
        json={"body": "Please add differentiation notes."},
        headers=auth_header(role="Teacher", user_id=UNIT_HEAD_USER, linked_id=UNIT_HEAD_UUID),
    )
    assert res.status_code == 201, res.text

    events = _events_named(fake_send, "email/scheme-commented.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["recipient_email"] == "ama@scheme-notif.test"
    assert data["commenter_name"] == "A reviewer"
    assert data["comment"] == "Please add differentiation notes."

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert any(n["kind"] == "scheme_commented" for n in bell.json()["items"])
