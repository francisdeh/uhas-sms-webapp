"""Tests for the assignment-published email + SMS fan-out
(`_notify_assignment_created`) — the two-tier gate, per-guardian
dedup (a guardian with two children in the same class gets one
message, not two), class-scoping (a guardian whose only child is in a
different class stays silent), and the no-guardian-on-file case.

Monkeypatches `inngest_client.send` rather than requiring a live
Inngest dev server — same approach as
`attendance/tests/test_notifications.py`.
"""

from __future__ import annotations

from datetime import date

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.assignments.tests.conftest import (
    CLASS_OTHER_UUID,
    CLASS_UUID,
    GUARDIAN_UUID,
    SCHOOL_UUID,
    SUBJECT_UUID,
    auth_header,
)
from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.features.users.model import User, UserPreferences

pytestmark = pytest.mark.asyncio

GUARDIAN_USER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0601"
SECOND_CHILD_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0403"


@pytest_asyncio.fixture
async def seed_guardian_user(
    db_session: AsyncSession,
    seed_parent_and_children: tuple[Guardian, Student, Student],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> User:
    """Links `GUARDIAN_UUID` (primary for `STUDENT_UUID`, enrolled in
    `CLASS_UUID`) to an app `User` row — the notification fan-out
    skips guardians with no linked user, so every test that expects a
    notification to actually fire needs this. Also pulls in the
    subject + staff rows every `_create_and_publish` call needs."""
    _ = seed_parent_and_children, seed_subject, seed_staff
    user = User(
        id=GUARDIAN_USER_UUID,
        school_id=SCHOOL_UUID,
        email="akosua.parent@example.com",
        role="Parent",
        linked_id=GUARDIAN_UUID,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


class _FakeSend:
    def __init__(self) -> None:
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        return ["evt_fake"]


def _events_named(fake_send: _FakeSend, name: str) -> list[inngest.Event]:
    return [e for e in fake_send.events if e.name == name]


async def _create_and_publish(client: AsyncClient, *, class_id: str = str(CLASS_UUID)) -> str:
    create_res = await client.post(
        "/assignments",
        json={
            "subjectId": str(SUBJECT_UUID),
            "classId": class_id,
            "title": "Fractions worksheet",
            "dueDate": "2026-02-01",
        },
        headers=auth_header(role="Teacher"),
    )
    assert create_res.status_code == 201, create_res.text
    assignment_id = create_res.json()["id"]

    publish_res = await client.post(
        f"/assignments/{assignment_id}/publish",
        headers=auth_header(role="Teacher"),
    )
    assert publish_res.status_code == 200, publish_res.text
    return str(assignment_id)


# ─── publish → notifies ─────────────────────────────────────────────────────


async def test_publish_notifies_primary_guardian_in_app_and_email(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    _ = seed_guardian_user
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    events = _events_named(fake_send, "email/assignment-created.requested")
    assert len(events) == 1
    data = dict(events[0].data)
    assert data["guardian_email"] == "akosua.parent@example.com"
    assert data["title"] == "Fractions worksheet"
    assert data["class_name"] == "JHS 1"
    assert data["link"] == "/parent/assignments"
    assert data["preferences_link"] == "/parent/profile?tab=notifications"

    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER_UUID, linked_id=GUARDIAN_UUID),
    )
    assert any(n["kind"] == "assignment_created" for n in bell.json()["items"])


async def test_emits_one_sms_with_guardian_phone(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    _ = seed_guardian_user
    guardian_row = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian_row is not None
    guardian_row.phone = "+233200000601"
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    sms_events = _events_named(fake_send, "sms/fanout.requested")
    assert len(sms_events) == 1
    data = dict(sms_events[0].data)
    assert data["category"] == "assignment"
    assert data["recipients"] == [{"phone": "+233200000601", "guardian_id": str(GUARDIAN_UUID)}]


async def test_guardian_with_two_children_in_same_class_gets_one_notification(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    """Dedup: GUARDIAN_UUID gains a second child also enrolled in
    CLASS_UUID — publishing to that class must still fan out exactly
    one email (not one per child)."""
    _ = seed_guardian_user
    second_child = Student(
        id=SECOND_CHILD_UUID,
        slug="UHAS-2025-0003",
        school_id=SCHOOL_UUID,
        first_name="Yaw",
        last_name="Owusu",
        is_active=True,
    )
    db_session.add(second_child)
    await db_session.flush()
    db_session.add_all(
        [
            StudentGuardian(
                student_id=SECOND_CHILD_UUID,
                guardian_id=GUARDIAN_UUID,
                relation="mother",
                is_primary=True,
            ),
            Enrollment(
                student_id=SECOND_CHILD_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert len(_events_named(fake_send, "email/assignment-created.requested")) == 1


OTHER_CLASS_STUDENT_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0404"
OTHER_CLASS_GUARDIAN_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0503"
OTHER_CLASS_GUARDIAN_USER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0602"


async def test_guardian_of_a_different_class_is_not_notified(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    """A guardian whose only child is enrolled in CLASS_OTHER_UUID must
    not be notified when an assignment publishes for CLASS_UUID —
    class-scoping, not a school-wide broadcast."""
    _ = seed_guardian_user
    other_student = Student(
        id=OTHER_CLASS_STUDENT_UUID,
        slug="UHAS-2025-0004",
        school_id=SCHOOL_UUID,
        first_name="Esi",
        last_name="Boateng",
        is_active=True,
    )
    other_guardian = Guardian(
        id=OTHER_CLASS_GUARDIAN_UUID,
        slug="GRD-003",
        school_id=SCHOOL_UUID,
        first_name="Kobby",
        last_name="Boateng",
        email="kobby.boateng@example.com",
    )
    db_session.add_all([other_student, other_guardian])
    await db_session.flush()
    db_session.add_all(
        [
            StudentGuardian(
                student_id=OTHER_CLASS_STUDENT_UUID,
                guardian_id=OTHER_CLASS_GUARDIAN_UUID,
                relation="father",
                is_primary=True,
            ),
            Enrollment(
                student_id=OTHER_CLASS_STUDENT_UUID,
                class_id=CLASS_OTHER_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            User(
                id=OTHER_CLASS_GUARDIAN_USER_UUID,
                school_id=SCHOOL_UUID,
                email="kobby.boateng@example.com",
                role="Parent",
                linked_id=OTHER_CLASS_GUARDIAN_UUID,
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client, class_id=str(CLASS_UUID))

    events = _events_named(fake_send, "email/assignment-created.requested")
    assert len(events) == 1
    assert dict(events[0].data)["guardian_email"] == "akosua.parent@example.com"


# ─── two-tier gate ──────────────────────────────────────────────────────────


async def test_defaults_to_on_for_a_school_that_never_configured_it(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    """Unlike attendance's `on_attendance_absent`, `on_assignment_created`
    defaults to True — a plain seeded school (no explicit
    `notification_defaults`) must still notify."""
    _ = seed_guardian_user
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert len(_events_named(fake_send, "email/assignment-created.requested")) == 1


async def test_skips_when_school_default_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    _ = seed_guardian_user
    school = await db_session.get(School, SCHOOL_UUID)
    assert school is not None
    school.notification_defaults = {"on_assignment_created": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert fake_send.events == []


async def test_skips_email_only_when_guardian_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    _ = seed_guardian_user
    guardian_row = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian_row is not None
    guardian_row.phone = "+233200000601"
    db_session.add(UserPreferences(user_id=GUARDIAN_USER_UUID, email_on_assignment_created=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert _events_named(fake_send, "email/assignment-created.requested") == []
    assert len(_events_named(fake_send, "sms/fanout.requested")) == 1


async def test_skips_sms_only_when_guardian_opts_out(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_guardian_user: User,
) -> None:
    _ = seed_guardian_user
    guardian_row = await db_session.get(Guardian, GUARDIAN_UUID)
    assert guardian_row is not None
    guardian_row.phone = "+233200000601"
    db_session.add(UserPreferences(user_id=GUARDIAN_USER_UUID, sms_on_assignment_created=False))
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert len(_events_named(fake_send, "email/assignment-created.requested")) == 1
    assert _events_named(fake_send, "sms/fanout.requested") == []


async def test_no_primary_guardian_is_silent(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
) -> None:
    """No `seed_parent_and_children`/`seed_guardian_user` fixture here —
    no student is even enrolled in CLASS_UUID. Publishing must not
    error, just find zero recipients."""
    _ = seed_staff, seed_classes, seed_subject
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    await _create_and_publish(client)

    assert fake_send.events == []
