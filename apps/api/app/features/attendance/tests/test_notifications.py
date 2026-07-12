"""Tests for the attendance-absence email + SMS fan-out
(`_notify_attendance_absences`) — the dedup rule (only a status
transition *into* Absent notifies, not a resubmission of an
already-absent record), the per-guardian batching of multiple
newly-absent children into one message, the two-tier gate, and the
explicit silence of "Late"/"Excused" statuses (out of scope by
design, see
`docs/superpowers/specs/2026-07-12-attendance-absence-notifications-design.md`).

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
from app.features.attendance.tests.conftest import (
    CLASS_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    auth_header,
)
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.users.model import User, UserPreferences

pytestmark = pytest.mark.asyncio

GUARDIAN_UUID = "dddddddd-dddd-4ddd-8ddd-ddddddddd201"
GUARDIAN_USER = "dddddddd-dddd-4ddd-8ddd-ddddddddd301"


@pytest_asyncio.fixture
async def seed_guardian(
    db_session: AsyncSession, seed_students: tuple[Student, Student]
) -> tuple[Guardian, User]:
    """One guardian, primary for BOTH seeded students — lets the same
    fixture cover both the single-child and batched-two-children
    cases depending on which students a test marks absent. Also opts
    the school into `on_attendance_absent` — it defaults to False
    (unlike every other domain's toggle), so tests that expect a
    notification to actually fire need this."""
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_attendance_absent": True}
    await db_session.flush()

    guardian = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-att-001",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Mensah",
        email="efua@attendance-notif.test",
    )
    db_session.add(guardian)
    await db_session.flush()

    db_session.add_all(
        [
            StudentGuardian(student_id=STUDENT_A_UUID, guardian_id=GUARDIAN_UUID, is_primary=True),
            StudentGuardian(student_id=STUDENT_B_UUID, guardian_id=GUARDIAN_UUID, is_primary=True),
        ]
    )

    user = User(
        id=GUARDIAN_USER,
        school_id=SCHOOL_UUID,
        email="efua@attendance-notif.test",
        role="Parent",
        linked_id=GUARDIAN_UUID,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return guardian, user


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


def _payload(status_a: str = "Present", status_b: str = "Absent") -> dict[str, object]:
    return {
        "classId": str(CLASS_UUID),
        "date": "2026-01-15",
        "term": 2,
        "records": [
            {"studentId": str(STUDENT_A_UUID), "status": status_a},
            {"studentId": str(STUDENT_B_UUID), "status": status_b, "note": "Sick"},
        ],
    }


async def _save(
    client: AsyncClient, *, status_a: str = "Present", status_b: str = "Absent"
) -> None:
    res = await client.post(
        "/attendance/sessions",
        json=_payload(status_a=status_a, status_b=status_b),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code in (200, 201), res.text


# ─── new absence → notifies ─────────────────────────────────────────────────


async def test_new_absence_notifies_primary_guardian_in_app_and_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    events = _events_named(fake_send, "email/attendance-absent.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["guardian_email"] == "efua@attendance-notif.test"
    assert data["student_names"] == "Kojo Boateng"
    assert data["was_were"] == "was"
    assert data["link"] == "/parent/attendance"
    assert data["preferences_link"] == "/parent/profile?tab=notifications"

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert any(n["kind"] == "attendance_absent" for n in bell.json()["items"])


async def test_two_children_absent_same_save_are_batched(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Absent", status_b="Absent")

    events = _events_named(fake_send, "email/attendance-absent.requested")
    assert len(events) == 1  # one guardian, one combined email
    data = dict(events[0].data)
    assert data["student_names"] == "Akua Mensah and Kojo Boateng"
    assert data["was_were"] == "were"


async def test_emits_one_sms_with_guardian_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    _ = seed_guardian
    guardian_row = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian_row is not None
    guardian_row.phone = "+233200000501"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 1
    data = dict(sms_events[0].data)
    assert data["category"] == "absence"
    assert data["recipients"] == [{"phone": "+233200000501", "guardian_id": str(GUARDIAN_UUID)}]


# ─── dedup — the core problem this PR solves ───────────────────────────────


async def test_resubmitting_unchanged_absence_does_not_renotify(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    """A teacher fixing a note/late-reason hours later resubmits the
    whole session — the already-absent student must not re-trigger."""
    _ = seed_staff
    await _save(client, status_a="Present", status_b="Absent")

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    assert _events_named(fake_send, "email/attendance-absent.requested") == []


async def test_flipping_back_to_absent_renotifies(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    """Absent -> Present -> Absent across three saves: the third save
    is a genuine new transition into Absent and must notify again."""
    _ = seed_staff
    await _save(client, status_a="Present", status_b="Absent")
    await _save(client, status_a="Present", status_b="Present")

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    events = _events_named(fake_send, "email/attendance-absent.requested")
    assert len(events) == 1
    assert dict(events[0].data)["student_names"] == "Kojo Boateng"


async def test_late_status_does_not_notify(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Late")

    assert fake_send.events == []


# ─── two-tier gate ──────────────────────────────────────────────────────────


async def test_defaults_to_off_for_a_school_that_never_configured_it(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    """Unlike every other domain's toggle, `on_attendance_absent`
    defaults to False — a plain seeded school (no explicit
    `notification_defaults` at all, not even the `seed_guardian`
    fixture's opt-in) must stay silent even with a primary guardian
    on file and a genuine new absence."""
    _ = seed_staff
    guardian = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-att-002",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Mensah",
        email="efua-default-off@attendance-notif.test",
    )
    db_session.add(guardian)
    db_session.add(
        StudentGuardian(student_id=STUDENT_B_UUID, guardian_id=GUARDIAN_UUID, is_primary=True)
    )
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    assert fake_send.events == []


async def test_skips_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_attendance_absent": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    assert fake_send.events == []


async def test_skips_email_only_when_guardian_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian: tuple[Guardian, User],
    seed_staff: Staff,
) -> None:
    _ = seed_staff
    guardian_row = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian_row is not None
    guardian_row.phone = "+233200000501"
    db_session.add(UserPreferences(user_id=GUARDIAN_USER, email_on_attendance_absent=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    assert _events_named(fake_send, "email/attendance-absent.requested") == []
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


async def test_no_primary_guardian_is_silent(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_students: tuple[Student, Student],
    seed_staff: Staff,
) -> None:
    """No `seed_guardian` fixture here — neither student has a
    guardian on file. Marking one absent must not error."""
    _ = seed_students, seed_staff
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _save(client, status_a="Present", status_b="Absent")

    assert fake_send.events == []
