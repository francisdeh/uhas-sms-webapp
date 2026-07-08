"""End-to-end tests for the Appointments router.

Coverage groups:
  1. `teachers-for-student` picker + ownership check
  2. Create — ownership, teaching-link, past-date gates
  3. Respond — teacher ownership, terminal-status guard, decline reason
  4. Cancel — guardian ownership, terminal-status guard
  5. Notification fan-out — teacher gets `appointment_requested`,
     guardian gets `appointment_decided`
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.features.appointments.constants import CLASS_TEACHER_SENTINEL
from app.features.appointments.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    GUARDIAN_USER,
    GUARDIAN_UUID,
    OTHER_GUARDIAN_USER,
    OTHER_GUARDIAN_UUID,
    OTHER_TEACHER_STAFF,
    OTHER_TEACHER_USER,
    STUDENT_UUID,
    TEACHER_STAFF,
    TEACHER_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


def _future(days: int = 7) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def _past_date() -> str:
    """Two days ago in UTC — unambiguously in the past, even on a machine
    running in a timezone ahead of UTC."""
    return (date.today() - timedelta(days=2)).isoformat()


# ─── Teacher picker ─────────────────────────────────────────────────────────


async def test_teachers_picker_returns_class_and_subject_dedupe(
    client: AsyncClient, seed: None
) -> None:
    """The seeded TEACHER is both class teacher AND Maths teacher for
    the child's class — should show up once with both sentinels."""
    _ = seed
    res = await client.get(
        f"/appointments/teachers-for-student?studentId={STUDENT_UUID}",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(TEACHER_STAFF)
    assert set(items[0]["subjects"]) == {CLASS_TEACHER_SENTINEL, "Mathematics"}


async def test_teachers_picker_rejects_foreign_student(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.get(
        f"/appointments/teachers-for-student?studentId={STUDENT_UUID}",
        headers=auth_header(
            role="Parent",
            user_id=OTHER_GUARDIAN_USER,
            linked_id=OTHER_GUARDIAN_UUID,
        ),
    )
    assert res.status_code == 403


# ─── Create ─────────────────────────────────────────────────────────────────


async def _make_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "studentId": str(STUDENT_UUID),
        "teacherId": str(TEACHER_STAFF),
        "preferredDate": _future(),
        "preferredSlot": "snack",
        "reason": "Progress check-in",
    }
    body.update(overrides)
    return body


async def test_parent_creates_appointment(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/appointments",
        json=await _make_body(),
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "pending"
    assert body["teacherId"] == str(TEACHER_STAFF)


async def test_create_rejects_foreign_student(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/appointments",
        json=await _make_body(),
        headers=auth_header(
            role="Parent",
            user_id=OTHER_GUARDIAN_USER,
            linked_id=OTHER_GUARDIAN_UUID,
        ),
    )
    assert res.status_code == 403


async def test_create_rejects_wrong_teacher(client: AsyncClient, seed: None) -> None:
    """OTHER_TEACHER teaches CLASS_OTHER, not the child's class."""
    _ = seed
    res = await client.post(
        "/appointments",
        json=await _make_body(teacherId=str(OTHER_TEACHER_STAFF)),
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 400


async def test_create_rejects_past_date(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/appointments",
        json=await _make_body(preferredDate=_past_date()),
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 400


async def test_teacher_cannot_create(client: AsyncClient, seed: None) -> None:
    _ = seed
    res = await client.post(
        "/appointments",
        json=await _make_body(),
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 403


# ─── Respond ────────────────────────────────────────────────────────────────


async def _make_appointment(client: AsyncClient) -> str:
    res = await client.post(
        "/appointments",
        json=await _make_body(),
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    return str(res.json()["id"])


async def test_teacher_confirms(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "confirmed"


async def test_teacher_declines_requires_reason(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "decline"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert res.status_code == 400


async def test_other_teacher_cannot_respond(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(
            role="Teacher",
            user_id=OTHER_TEACHER_USER,
            linked_id=OTHER_TEACHER_STAFF,
        ),
    )
    assert res.status_code == 403


async def test_admin_can_respond(client: AsyncClient, seed: None) -> None:
    """Admin can respond on a teacher's behalf — matches the TS `Admin`
    override path used for parent-facing tooling."""
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert res.status_code == 200


async def test_cannot_re_respond(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    teacher = auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF)
    await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=teacher,
    )
    res = await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "decline", "response": "changed my mind"},
        headers=teacher,
    )
    assert res.status_code == 409


# ─── Cancel ────────────────────────────────────────────────────────────────


async def test_guardian_cancels_own(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 204

    # Follow-up read — it should still exist with status `cancelled`.
    detail = await client.get(
        f"/appointments/{appt_id}",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert detail.json()["status"] == "cancelled"


async def test_other_guardian_cannot_cancel(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(
            role="Parent",
            user_id=OTHER_GUARDIAN_USER,
            linked_id=OTHER_GUARDIAN_UUID,
        ),
    )
    assert res.status_code == 403


async def test_cannot_cancel_after_decline(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "decline", "response": "Not this week"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    res = await client.post(
        f"/appointments/{appt_id}/cancel",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 409


# ─── Notification fan-out ──────────────────────────────────────────────────


async def test_create_notifies_teacher(client: AsyncClient, seed: None) -> None:
    """Parent creates a request → teacher's bell shows
    `appointment_requested`."""
    _ = seed
    await _make_appointment(client)
    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    body = bell.json()
    assert body["unreadCount"] >= 1
    assert any(n["kind"] == "appointment_requested" for n in body["items"])


async def test_respond_notifies_guardian(client: AsyncClient, seed: None) -> None:
    _ = seed
    appt_id = await _make_appointment(client)
    await client.post(
        f"/appointments/{appt_id}/respond",
        json={"decision": "confirm"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    bell = await client.get(
        "/notifications/bell",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert any(
        n["kind"] == "appointment_decided" and "confirmed" in n["title"]
        for n in bell.json()["items"]
    )


# ─── List scoping ──────────────────────────────────────────────────────────


async def test_parent_list_scoped_to_own(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _make_appointment(client)
    res = await client.get(
        "/appointments",
        headers=auth_header(role="Parent", user_id=GUARDIAN_USER, linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 200
    assert res.json()["total"] == 1

    # Other guardian sees nothing.
    other = await client.get(
        "/appointments",
        headers=auth_header(
            role="Parent",
            user_id=OTHER_GUARDIAN_USER,
            linked_id=OTHER_GUARDIAN_UUID,
        ),
    )
    assert other.json()["total"] == 0


async def test_teacher_list_scoped_to_own_inbox(client: AsyncClient, seed: None) -> None:
    _ = seed
    await _make_appointment(client)

    inbox = await client.get(
        "/appointments",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_STAFF),
    )
    assert inbox.json()["total"] == 1

    other = await client.get(
        "/appointments",
        headers=auth_header(
            role="Teacher",
            user_id=OTHER_TEACHER_USER,
            linked_id=OTHER_TEACHER_STAFF,
        ),
    )
    assert other.json()["total"] == 0
