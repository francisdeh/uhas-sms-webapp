"""Tests for the two newest additions from this cycle's "promotions
revisit":

  1. `POST /promotions/submissions/bulk-approve` — a Deputy Head
     clearing several submitted classes at once. Best-effort: one
     submission_id that doesn't resolve shouldn't roll back another
     submission's successful approval in the same batch (proves the
     `session.begin_nested()` savepoint isolation actually works, not
     just that the endpoint returns 200).

  2. `PromotionsService.send_unsubmitted_reminders` — the weekly
     reminder job's service-level logic (own test, no HTTP layer,
     mirrors `fees/tests/test_reminders.py`'s direct-service-call
     pattern since this isn't router-exposed).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam
from app.features.notifications.model import Notification
from app.features.promotions.model import PromotionSubmission
from app.features.promotions.service import PromotionsService
from app.features.promotions.tests.conftest import (
    ADMIN_UUID,
    CLASS_JHS1_UUID,
    CLASS_JHS2_NEXT_UUID,
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


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


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


# ─── Bulk approve ────────────────────────────────────────────────────────────


async def test_bulk_approve_all_succeed(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
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
    res = await client.post(
        "/promotions/submissions/bulk-approve",
        json={"submissionIds": [submission_id]},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200, res.text
    results = res.json()["results"]
    assert len(results) == 1
    assert results[0]["success"] is True
    assert results[0]["className"] == "JHS 1"
    assert results[0]["error"] is None


async def test_bulk_approve_one_bad_id_does_not_roll_back_the_other(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
    db_session: AsyncSession,
) -> None:
    """Proves the savepoint isolation: a nonexistent submission_id in
    the same batch fails on its own without undoing the valid one's
    approval + enrolment materialisation."""
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
    bogus_id = str(uuid.uuid4())

    res = await client.post(
        "/promotions/submissions/bulk-approve",
        json={"submissionIds": [submission_id, bogus_id]},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200, res.text
    results = {r["submissionId"]: r for r in res.json()["results"]}

    assert results[submission_id]["success"] is True
    assert results[bogus_id]["success"] is False
    assert results[bogus_id]["error"] is not None

    # The valid submission's approval must have actually persisted —
    # the bad id's failure didn't roll back the good one's savepoint.
    submission = await db_session.get(PromotionSubmission, uuid.UUID(submission_id))
    assert submission is not None
    assert submission.status == "approved"

    enrolment = (
        await db_session.execute(
            select(Enrollment).where(
                Enrollment.student_id == STUDENT1_UUID,
                Enrollment.academic_year == "2025/2026",
            )
        )
    ).scalar_one()
    assert enrolment.status == "Completed"


async def test_bulk_approve_requires_admin_or_deputy(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post(
        "/promotions/submissions/bulk-approve",
        json={"submissionIds": [str(uuid.uuid4())]},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Weekly reminder job (service-level, no router endpoint) ────────────────


async def test_reminder_creates_submission_and_notifies_class_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
    db_session: AsyncSession,
) -> None:
    """Season open, JHS 1's teacher never opened the page (no
    submission row yet) — the reminder must create one via
    `ensure_submission` so there's a row to stamp the cooldown on."""
    _ = (
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    _ = seed_school
    await _open_season(client)

    reminded = await PromotionsService.send_unsubmitted_reminders(db_session, SCHOOL_UUID)
    assert reminded >= 1

    submission = (
        await db_session.execute(
            select(PromotionSubmission).where(PromotionSubmission.class_id == CLASS_JHS1_UUID)
        )
    ).scalar_one()
    assert submission.status == "draft"
    assert submission.last_reminder_sent_at is not None


async def test_reminder_skips_already_submitted_class(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
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
    )
    submission_id = await _submit_jhs1(client)

    await PromotionsService.send_unsubmitted_reminders(db_session, SCHOOL_UUID)

    submission = await db_session.get(PromotionSubmission, uuid.UUID(submission_id))
    assert submission is not None
    assert submission.last_reminder_sent_at is None


async def test_reminder_respects_cooldown(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
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
    )
    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))
    ensure = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=teacher_headers,
    )
    submission_id = ensure.json()["submissionId"]

    submission = await db_session.get(PromotionSubmission, uuid.UUID(submission_id))
    assert submission is not None
    stamped_at = _now() - timedelta(days=1)
    submission.last_reminder_sent_at = stamped_at
    await db_session.flush()

    # `teacher` also teaches JHS 3 (see `seed_class_teachers`), which has
    # no submission yet and so gets reminded regardless — assert on JHS
    # 1's own timestamp rather than the aggregate count, since that's
    # the one actually under cooldown here.
    await PromotionsService.send_unsubmitted_reminders(db_session, SCHOOL_UUID)
    await db_session.refresh(submission)
    assert submission.last_reminder_sent_at == stamped_at


async def test_reminder_returns_zero_when_no_open_season(
    db_session: AsyncSession,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    _ = seed_staff
    _ = seed_school
    reminded = await PromotionsService.send_unsubmitted_reminders(db_session, SCHOOL_UUID)
    assert reminded == 0


async def test_reminder_notifies_the_class_teacher_with_correct_link(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
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
    )
    teacher_user = User(
        id=uuid.UUID("eeeeeeee-eeee-4eee-8eee-eeeeeeee0099"),
        school_id=SCHOOL_UUID,
        email="teacher@promotions-reminder.test",
        role="Teacher",
        linked_id=TEACHER_UUID,
        is_active=True,
    )
    db_session.add(teacher_user)
    await db_session.flush()

    await _open_season(client)
    await PromotionsService.send_unsubmitted_reminders(db_session, SCHOOL_UUID)

    # `teacher` also teaches JHS 3 (see `seed_class_teachers`), so it
    # gets reminded for both unsubmitted classes — filter to JHS 1's.
    row = (
        await db_session.execute(
            select(Notification).where(
                Notification.school_id == SCHOOL_UUID,
                Notification.kind == "promotion_reminder",
                Notification.link == f"/teacher/promotions/{CLASS_JHS1_UUID}",
            )
        )
    ).scalar_one()
    assert row.user_id == teacher_user.id
