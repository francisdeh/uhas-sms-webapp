"""Tests for the gaps found by this cycle's "promotions revisit" audit:

  1. `submit_list` now notifies every Deputy Head of the class's
     division plus every Admin (previously silent — the DH had to
     manually check the queue).
  2. `approve` now notifies the submitting teacher of the outcome
     (previously only `send_back` did).
  3. Comment history survives repeat send-backs — replaces the old
     single overwriting `reviewer_comment` column.
  4. `GET /promotions/season` exposes whether the Term-3 EndOfTerm exam
     is actually published, instead of the Admin page hardcoding
     `false` for that flag.
  5. The four other state-transition endpoints reject a closed season
     the same way `ensure_submission` already did (only that one had
     a test).

In-app notifications only — promotions predates the email/SMS
notification initiative, so there's no `inngest_client.send` to
monkeypatch here (contrast with `leave_requests/tests/test_notifications.py`).
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.exams.model import Exam
from app.features.notifications.model import Notification
from app.features.promotions.tests.conftest import (
    ADMIN_UUID,
    CLASS_JHS1_UUID,
    CLASS_JHS2_NEXT_UUID,
    DEPUTY_JHS_UUID,
    DEPUTY_KG_UUID,
    SCHOOL_UUID,
    STUDENT1_UUID,
    STUDENT2_UUID,
    TEACHER_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.features.users.model import User

pytestmark = pytest.mark.asyncio

ADMIN_USER_UUID = uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0001")
DEPUTY_JHS_USER_UUID = uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0002")
DEPUTY_KG_USER_UUID = uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0003")
TEACHER_USER_UUID = uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0004")


@pytest_asyncio.fixture
async def seed_users(db_session: AsyncSession, seed_staff: dict[str, Staff]) -> dict[str, User]:
    """`users` bridge rows — without these, `resolve_audience`/
    `find_user_for_linked` return nothing and the notification branch
    short-circuits before reaching our code."""
    _ = seed_staff
    admin = User(
        id=ADMIN_USER_UUID,
        school_id=SCHOOL_UUID,
        email="admin@promotions-notif.test",
        role="Admin",
        linked_id=ADMIN_UUID,
        is_active=True,
    )
    deputy_jhs = User(
        id=DEPUTY_JHS_USER_UUID,
        school_id=SCHOOL_UUID,
        email="dh-jhs@promotions-notif.test",
        role="DeputyHead",
        linked_id=DEPUTY_JHS_UUID,
        is_active=True,
    )
    deputy_kg = User(
        id=DEPUTY_KG_USER_UUID,
        school_id=SCHOOL_UUID,
        email="dh-kg@promotions-notif.test",
        role="DeputyHead",
        linked_id=DEPUTY_KG_UUID,
        is_active=True,
    )
    teacher = User(
        id=TEACHER_USER_UUID,
        school_id=SCHOOL_UUID,
        email="teacher@promotions-notif.test",
        role="Teacher",
        linked_id=TEACHER_UUID,
        is_active=True,
    )
    db_session.add_all([admin, deputy_jhs, deputy_kg, teacher])
    await db_session.flush()
    return {"admin": admin, "deputy_jhs": deputy_jhs, "deputy_kg": deputy_kg, "teacher": teacher}


async def _open_season(client: AsyncClient) -> None:
    res = await client.post(
        "/promotions/season/open",
        json={"override": False},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200, res.text


async def _submit_jhs1(client: AsyncClient) -> str:
    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))
    ensure = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=teacher_headers,
    )
    submission_id = ensure.json()["submissionId"]
    submit = await client.post(
        f"/promotions/submissions/{submission_id}/submit",
        json={
            "updates": [
                {
                    "studentId": str(STUDENT1_UUID),
                    "decision": "repeat",
                    "targetClassId": str(CLASS_JHS2_NEXT_UUID),
                    "reason": "Failed 3 core subjects",
                },
                {
                    "studentId": str(STUDENT2_UUID),
                    "decision": "promote",
                    "targetClassId": str(CLASS_JHS2_NEXT_UUID),
                    "reason": None,
                },
            ]
        },
        headers=teacher_headers,
    )
    assert submit.status_code == 200, submit.text
    return str(submission_id)


# ─── Submit notifies reviewers ──────────────────────────────────────────────


async def test_submit_notifies_division_deputy_and_admin_but_not_other_division(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
    seed_users: dict[str, User],
    db_session: AsyncSession,
) -> None:
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
        seed_users,
    )
    await _submit_jhs1(client)

    rows = (
        (
            await db_session.execute(
                select(Notification).where(
                    Notification.school_id == SCHOOL_UUID,
                    Notification.kind == "promotion_submitted",
                )
            )
        )
        .scalars()
        .all()
    )
    recipient_ids = {r.user_id for r in rows}
    assert recipient_ids == {DEPUTY_JHS_USER_UUID, ADMIN_USER_UUID}
    assert DEPUTY_KG_USER_UUID not in recipient_ids

    dh_notification = next(r for r in rows if r.user_id == DEPUTY_JHS_USER_UUID)
    assert dh_notification.link is not None
    assert dh_notification.link.startswith("/deputy-head/promotions/")
    admin_notification = next(r for r in rows if r.user_id == ADMIN_USER_UUID)
    assert admin_notification.link is not None
    assert admin_notification.link.startswith("/admin/promotions/")


# ─── Approve notifies the teacher ───────────────────────────────────────────


async def test_approve_notifies_submitting_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
    seed_users: dict[str, User],
    db_session: AsyncSession,
) -> None:
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
        seed_users,
    )
    submission_id = await _submit_jhs1(client)

    approve = await client.post(
        f"/promotions/submissions/{submission_id}/approve",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert approve.status_code == 200, approve.text

    row = (
        await db_session.execute(
            select(Notification).where(
                Notification.school_id == SCHOOL_UUID,
                Notification.kind == "promotion_approved",
            )
        )
    ).scalar_one()
    assert row.user_id == TEACHER_USER_UUID
    assert row.link == f"/teacher/promotions/{CLASS_JHS1_UUID}"


# ─── Comment thread survives repeat send-backs ──────────────────────────────


async def test_comment_thread_survives_repeat_send_backs(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """The bug this PR fixes: a second send-back used to overwrite the
    first comment. Now each send-back appends to the thread."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    submission_id = await _submit_jhs1(client)
    deputy_headers = auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID))
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))

    first = await client.post(
        f"/promotions/submissions/{submission_id}/send-back",
        json={"comment": "First round: check student1's scores."},
        headers=deputy_headers,
    )
    assert first.status_code == 200, first.text

    # Teacher edits + resubmits.
    resubmit = await client.post(
        f"/promotions/submissions/{submission_id}/submit",
        json={
            "updates": [
                {
                    "studentId": str(STUDENT1_UUID),
                    "decision": "repeat",
                    "targetClassId": str(CLASS_JHS2_NEXT_UUID),
                    "reason": "Confirmed after re-check.",
                },
                {
                    "studentId": str(STUDENT2_UUID),
                    "decision": "promote",
                    "targetClassId": str(CLASS_JHS2_NEXT_UUID),
                    "reason": None,
                },
            ]
        },
        headers=teacher_headers,
    )
    assert resubmit.status_code == 200, resubmit.text

    second = await client.post(
        f"/promotions/submissions/{submission_id}/send-back",
        json={"comment": "Second round: also check student2."},
        headers=deputy_headers,
    )
    assert second.status_code == 200, second.text

    detail = await client.get(f"/promotions/submissions/{submission_id}", headers=deputy_headers)
    comments = detail.json()["comments"]
    assert len(comments) == 2
    assert comments[0]["body"] == "First round: check student1's scores."
    assert comments[1]["body"] == "Second round: also check student2."
    assert comments[0]["authorName"] == "Yaw Deputy-JHS"


# ─── Season exposes exam-published flag ─────────────────────────────────────


async def test_season_reports_published_exam_flag(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
    seed_subjects: list[Subject],
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    _ = (seed_school, seed_staff, seed_subjects, seed_students_and_enrollments)
    await _open_season(client)
    res = await client.get(
        "/promotions/season", headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID))
    )
    assert res.status_code == 200
    assert res.json()["hasPublishedTerm3EndOfTerm"] is True


async def test_season_reports_unpublished_exam_flag(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    """Opened with override (no exam at all) → flag stays False."""
    _ = (seed_school, seed_staff)
    await client.post(
        "/promotions/season/open",
        json={"override": True},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    res = await client.get(
        "/promotions/season", headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID))
    )
    assert res.status_code == 200
    assert res.json()["hasPublishedTerm3EndOfTerm"] is False


# ─── Closed-season rejection — the four endpoints `ensure` already had ──────


async def test_save_draft_rejects_when_season_closed(
    client: AsyncClient, seed_school: School, seed_staff: dict[str, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.patch(
        f"/promotions/submissions/{uuid.uuid4()}/decisions",
        json={"updates": []},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 409


async def test_submit_rejects_when_season_closed(
    client: AsyncClient, seed_school: School, seed_staff: dict[str, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post(
        f"/promotions/submissions/{uuid.uuid4()}/submit",
        json={"updates": []},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 409


async def test_send_back_rejects_when_season_closed(
    client: AsyncClient, seed_school: School, seed_staff: dict[str, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post(
        f"/promotions/submissions/{uuid.uuid4()}/send-back",
        json={"comment": "test"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert res.status_code == 409


async def test_approve_rejects_when_season_closed(
    client: AsyncClient, seed_school: School, seed_staff: dict[str, Staff]
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post(
        f"/promotions/submissions/{uuid.uuid4()}/approve",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 409
