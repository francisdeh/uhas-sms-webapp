"""Tests for the appointments email + SMS fan-out
(`_notify_appointment_channels`) — the two-tier gate (school-level
`notification_defaults` + per-user `user_preferences`), the school
footer fields merged into every outbound email event, and `cancel()`'s
in-app notification (previously the appointment could be withdrawn
without telling the teacher at all).

Monkeypatches `inngest_client.send` rather than requiring a live
Inngest dev server — same approach as
`lesson_plans/tests/test_rejection_email.py`. The jobs that actually
render + send the emails have their own coverage in
`test_jobs.py`.
"""

from __future__ import annotations

from datetime import date, timedelta

import inngest
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.appointments.tests.conftest import (
    GUARDIAN_USER,
    GUARDIAN_UUID,
    SCHOOL_UUID,
    STUDENT_UUID,
    TEACHER_STAFF,
    TEACHER_USER,
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


def _future() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


def _make_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "studentId": str(STUDENT_UUID),
        "teacherId": str(TEACHER_STAFF),
        "preferredDate": _future(),
        "preferredSlot": "snack",
        "reason": "Progress check-in",
    }
    body.update(overrides)
    return body


async def _create_appointment(client: AsyncClient) -> str:
    res = await client.post(
        "/appointments",
        json=_make_body(),
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


# ─── School footer fields on the outbound email event ──────────────────────


async def test_create_email_event_carries_school_footer_fields(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.address = "Ho, Volta Region, Ghana"
    school.email = "info@appt-test.edu.gh"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_appointment(client)

    events = _events_named(fake_send, "email/appointment-requested.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["school_name"] == "Test School (appointments)"
    assert data["school_address"] == "Ho, Volta Region, Ghana"
    assert data["school_contact_email"] == "info@appt-test.edu.gh"
    assert data["preferences_link"] == "/teacher/profile?tab=notifications"


# ─── Two-tier gate: create → teacher (direction "activity") ────────────────


async def test_create_emits_email_and_sms_when_everything_enabled(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    teacher = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher is not None
    teacher.phone = "+233200000401"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_appointment(client)

    assert len(_events_named(fake_send, "email/appointment-requested.requested")) == 1
    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 1
    sms_data = dict(sms_events[0].data)
    assert sms_data["category"] == "appointment"
    assert sms_data["recipients"] == [{"phone": "+233200000401", "guardian_id": None}]


async def test_create_skips_both_channels_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    teacher = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher is not None
    teacher.phone = "+233200000401"
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_appointment_activity": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_appointment(client)

    assert _events_named(fake_send, "email/appointment-requested.requested") == []
    assert _events_named(fake_send, "sms/fanout.requested") == []


async def test_create_skips_email_only_when_teacher_opts_out_of_email(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    """Per-user, per-channel: the teacher can silence email without
    silencing SMS — the two toggles are independent."""
    _ = seed
    teacher = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher is not None
    teacher.phone = "+233200000401"
    db_session.add(UserPreferences(user_id=TEACHER_USER, email_on_appointment_activity=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_appointment(client)

    assert _events_named(fake_send, "email/appointment-requested.requested") == []
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


async def test_create_skips_sms_when_teacher_has_no_phone(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    """No phone on file → SMS is silently skipped even though the
    per-user SMS preference defaults to allowed."""
    _ = seed
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_appointment(client)

    assert len(_events_named(fake_send, "email/appointment-requested.requested")) == 1
    assert _events_named(fake_send, "sms/fanout.requested") == []


# ─── Two-tier gate: respond → guardian (direction "decided") ───────────────


async def test_respond_email_event_uses_parent_preferences_link(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    appt_id = await _create_appointment(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 200

    events = _events_named(fake_send, "email/appointment-decided.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["guardian_email"] == "p@appt.test"
    assert data["preferences_link"] == "/parent/profile?tab=notifications"


async def test_respond_skips_sms_when_guardian_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    guardian = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian is not None
    guardian.phone = "+233200000501"
    db_session.add(UserPreferences(user_id=GUARDIAN_USER, sms_on_appointment_decided=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    appt_id = await _create_appointment(client)
    await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )

    assert len(_events_named(fake_send, "email/appointment-decided.requested")) == 1
    assert _events_named(fake_send, "sms/fanout.requested") == []


# ─── cancel() — the bug fix: previously notified nobody at all ─────────────


async def test_cancel_notifies_teacher_in_app(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _create_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 204

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    items = bell.json()["items"]
    assert any(
        n["kind"] == "appointment_cancelled" and n["title"] == "Appointment cancelled"
        for n in items
    )


async def test_cancel_emits_email_and_sms_to_teacher(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    teacher = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher is not None
    teacher.phone = "+233200000401"
    await db_session.flush()

    appt_id = await _create_appointment(client)

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 204

    email_events = _events_named(fake_send, "email/appointment-cancelled.requested")
    assert len(email_events) == 1
    data = dict(email_events[0].data)
    assert data["teacher_email"] == "t@appt.test"
    assert data["preferences_link"] == "/teacher/profile?tab=notifications"
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


async def test_cancel_skips_channels_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    _ = seed
    appt_id = await _create_appointment(client)

    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_appointment_activity": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 204
    assert fake_send.events == []


async def test_cancel_succeeds_even_if_event_emission_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed: None,
) -> None:
    """A broken event bus must not turn a successful cancel into a 500
    — same contract as the lesson-plan-rejection email emit site."""
    _ = seed
    teacher = await db_session.get(Staff, TEACHER_STAFF)
    assert teacher is not None
    teacher.phone = "+233200000401"
    await db_session.flush()

    appt_id = await _create_appointment(client)

    async def _raise(event: inngest.Event) -> list[str]:
        raise ConnectionError("simulated: no dev server reachable")

    monkeypatch.setattr(inngest_client, "send", _raise)

    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 204
