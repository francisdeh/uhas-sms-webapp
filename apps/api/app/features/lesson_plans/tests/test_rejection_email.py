"""Tests for the lesson-plan-rejection email trigger.

Monkeypatches `inngest_client.send` rather than requiring a live
Inngest dev server — these tests care about (a) the notification-default
gate, (b) the event payload shape, and (c) that a broken event bus
never fails the review itself. The job that actually sends the email
(`features/lesson_plans/jobs/rejection_email.py`) has its own coverage
via the email-integration tests.
"""

from __future__ import annotations

from uuid import UUID

import inngest
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.inngest import inngest_client
from app.features.classes.model import Class
from app.features.lesson_plans.tests.conftest import (
    SCHOOL_UUID,
    TEACHER_UUID,
    UNIT_HEAD_UUID,
    auth_header,
)
from app.features.lesson_plans.tests.test_router import _create_plan
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.features.users.model import User

TEACHER_USER_UUID = UUID("dddddddd-dddd-4ddd-8ddd-dddddddd0401")


@pytest_asyncio.fixture
async def seed_teacher_user(db_session: AsyncSession, seed_staff: tuple[Staff, ...]) -> User:
    """A `users` bridge row for the teacher — without this,
    `find_user_for_linked` returns None and the whole notification
    branch (in-app + email) short-circuits before reaching our code."""
    user = User(
        id=TEACHER_USER_UUID,
        school_id=SCHOOL_UUID,
        email="ama@uhas.edu.gh",
        role="Teacher",
        linked_id=TEACHER_UUID,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


async def _create_and_submit_plan(client: AsyncClient) -> str:
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    return plan_id


class _FakeSend:
    def __init__(self, *, raises: bool = False) -> None:
        self.raises = raises
        self.events: list[inngest.Event] = []

    async def __call__(self, event: inngest.Event) -> list[str]:
        self.events.append(event)
        if self.raises:
            raise ConnectionError("simulated: no dev server reachable")
        return ["evt_fake"]


async def test_rejection_emits_email_event_when_default_is_on(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, ...],
    seed_teacher_user: User,
) -> None:
    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    plan_id = await _create_and_submit_plan(client)
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "rejected", "comment": "Add more resources."},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 200

    assert len(fake_send.events) == 1
    event = fake_send.events[0]
    assert event.name == "email/lesson-plan-rejected.requested"
    data = dict(event.data)
    assert data["teacher_email"] == "ama@uhas.edu.gh"
    assert data["reviewer_name"] == "Kojo Head"
    assert data["comment"] == "Add more resources."
    assert data["link"] == f"/teacher/lesson-plans/{plan_id}"


async def test_rejection_skips_email_when_default_is_off(
    client: AsyncClient,
    db_session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, ...],
    seed_teacher_user: User,
) -> None:
    seed_school.notification_defaults = {"on_lesson_plan_rejected": False}
    await db_session.flush()

    fake_send = _FakeSend()
    monkeypatch.setattr(inngest_client, "send", fake_send)

    plan_id = await _create_and_submit_plan(client)
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "rejected"},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 200
    assert fake_send.events == []


async def test_review_succeeds_even_if_event_emission_fails(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, ...],
    seed_teacher_user: User,
) -> None:
    """The reviewer's decision is already committed by the time we try
    to emit the event — a broken event bus must not turn into a 500."""
    fake_send = _FakeSend(raises=True)
    monkeypatch.setattr(inngest_client, "send", fake_send)

    plan_id = await _create_and_submit_plan(client)
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "rejected"},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"
    assert len(fake_send.events) == 1  # it did try
