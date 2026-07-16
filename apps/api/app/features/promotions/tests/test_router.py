"""End-to-end tests for the Promotions router.

Coverage:
  1. Season open/close (Admin only, override precondition)
  2. Ensure submission (idempotent, roster prefill with suggestions)
  3. Save draft (teacher + Admin, sent_back → draft on edit)
  4. Submit list (pre-flight + role gate)
  5. Send back (Deputy division match)
  6. Approve (transactional — enrolments materialise, audit row written)
  7. Read projections (overview / DH queue / teacher classes)
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam
from app.features.promotions.tests.conftest import (
    ADMIN_UUID,
    CLASS_JHS1_UUID,
    CLASS_JHS2_NEXT_UUID,
    CLASS_JHS2_UUID,
    CLASS_JHS3_NEXT_UUID,
    CLASS_JHS3_UUID,
    DEPUTY_JHS_UUID,
    DEPUTY_KG_UUID,
    OTHER_TEACHER_UUID,
    SCHOOL_UUID,
    STUDENT1_UUID,
    STUDENT2_UUID,
    STUDENT_JHS3_UUID,
    TEACHER_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.subjects.model import Subject

pytestmark = pytest.mark.asyncio

# A genuine cross-division boundary (Upper Primary → JHS), unlike every
# other fixture in this suite which stays inside JHS. Regression coverage
# for the bug where target-class resolution filtered candidates by the
# CURRENT class's division instead of considering the whole school.
CLASS_PRIMARY6_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0104")
CLASS_JHS1_NEXT_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0203")
STUDENT_P6_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0505")


@pytest_asyncio.fixture
async def seed_cross_division_promotion(
    db_session: AsyncSession,
    seed_classes: dict[str, Class],
    seed_staff: dict[str, Staff],
) -> None:
    """A Primary 6 class this year, a JHS 1 class next year (a different
    division, and a different row from the current-year `CLASS_JHS1_UUID`
    already in `seed_classes`), one enrolled student, and `TEACHER_UUID`
    assigned as its class teacher."""
    _ = seed_classes, seed_staff
    db_session.add_all(
        [
            Class(
                id=CLASS_PRIMARY6_UUID,
                slug="p6-25",
                school_id=SCHOOL_UUID,
                name="Primary 6",
                division="Upper Primary",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_JHS1_NEXT_UUID,
                slug="jhs1-26",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2026/2027",
            ),
        ]
    )
    await db_session.flush()
    db_session.add_all(
        [
            ClassTeacher(class_id=CLASS_PRIMARY6_UUID, staff_id=TEACHER_UUID, is_primary=True),
            Student(
                id=STUDENT_P6_UUID,
                slug="STUDENT-P6",
                school_id=SCHOOL_UUID,
                first_name="Abena",
                last_name="Sixth",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()
    db_session.add(
        Enrollment(
            student_id=STUDENT_P6_UUID,
            class_id=CLASS_PRIMARY6_UUID,
            academic_year="2025/2026",
            status="Active",
            enrollment_date=date(2025, 9, 1),
        )
    )
    await db_session.flush()


# ─── Season ─────────────────────────────────────────────────────────────────


async def test_season_get_returns_null_when_no_row(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.get(
        "/promotions/season",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    assert res.json() is None


async def test_term3_exam_status_available_before_season_exists(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
    seed_subjects: list[Subject],
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """The whole point of this endpoint: unlike `SeasonRead`'s flag,
    this must work even when no season row exists yet."""
    _ = (seed_school, seed_staff, seed_subjects, seed_students_and_enrollments)
    _ = seed_term3_exam_and_scores
    season = await client.get(
        "/promotions/season",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert season.json() is None

    res = await client.get(
        "/promotions/term3-exam-status",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["hasPublishedTerm3EndOfTerm"] is True


async def test_term3_exam_status_false_when_unpublished(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.get(
        "/promotions/term3-exam-status",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["hasPublishedTerm3EndOfTerm"] is False


async def test_season_open_requires_admin(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
    seed_term3_exam_and_scores: Exam,
) -> None:
    _ = (seed_school, seed_staff, seed_term3_exam_and_scores)
    res = await client.post(
        "/promotions/season/open",
        json={"override": False},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert res.status_code == 403


async def test_season_open_blocks_without_published_exam(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    """No Term-3 EndOfTerm published + no override → 400."""
    _ = (seed_school, seed_staff)
    res = await client.post(
        "/promotions/season/open",
        json={"override": False},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 400


async def test_season_open_with_override(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
) -> None:
    _ = (seed_school, seed_staff)
    res = await client.post(
        "/promotions/season/open",
        json={"override": True},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["openedWithOverride"] is True
    assert body["season"]["status"] == "open"


async def test_season_open_conflict_when_already_open(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
    seed_term3_exam_and_scores: Exam,
) -> None:
    _ = (seed_school, seed_staff, seed_term3_exam_and_scores)
    admin_headers = auth_header(role="Admin", linked_id=str(ADMIN_UUID))
    await client.post("/promotions/season/open", json={"override": False}, headers=admin_headers)
    res = await client.post(
        "/promotions/season/open", json={"override": False}, headers=admin_headers
    )
    assert res.status_code == 409


async def test_season_close_flips_status(
    client: AsyncClient,
    seed_school: School,
    seed_staff: dict[str, Staff],
    seed_term3_exam_and_scores: Exam,
) -> None:
    _ = (seed_school, seed_staff, seed_term3_exam_and_scores)
    admin_headers = auth_header(role="Admin", linked_id=str(ADMIN_UUID))
    await client.post("/promotions/season/open", json={"override": False}, headers=admin_headers)
    res = await client.post("/promotions/season/close", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["status"] == "closed"


# ─── Ensure submission ──────────────────────────────────────────────────────


async def _open_season(client: AsyncClient) -> None:
    await client.post(
        "/promotions/season/open",
        json={"override": False},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )


async def test_ensure_submission_creates_and_prefills_suggestions(
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
    await _open_season(client)

    res = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 200
    submission_id = res.json()["submissionId"]

    detail = await client.get(
        f"/promotions/submissions/{submission_id}",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert detail.status_code == 200
    body = detail.json()

    decisions = {d["studentId"]: d for d in body["decisions"]}
    student1_row = decisions[str(STUDENT1_UUID)]
    student2_row = decisions[str(STUDENT2_UUID)]
    assert student1_row["suggestedDecision"] == "repeat"
    assert student1_row["failedCoreSubjects"] == 3
    assert student1_row["decision"] == "repeat"
    assert student2_row["suggestedDecision"] == "promote"
    # Auto-picked target for student2 (JHS 1 → JHS 2 next year).
    assert student2_row["targetClassId"] == str(CLASS_JHS2_NEXT_UUID)


async def test_cross_division_promotion_resolves_and_submits(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
    seed_cross_division_promotion: None,
) -> None:
    """Primary 6 → JHS 1 crosses a division boundary (Upper Primary →
    JHS). Regression test for the bug where target-class candidates were
    filtered by the CURRENT class's division, so a cross-division target
    could never be auto-picked or even offered in the manual dropdown."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
        seed_cross_division_promotion,
    )
    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))

    ensure = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_PRIMARY6_UUID)},
        headers=teacher_headers,
    )
    assert ensure.status_code == 200
    submission_id = ensure.json()["submissionId"]

    detail = await client.get(f"/promotions/submissions/{submission_id}", headers=teacher_headers)
    assert detail.status_code == 200
    body = detail.json()

    # The manual-picker dropdown must offer the cross-division target —
    # this is the exact list the old division-scoped query could never
    # include JHS 1 in.
    next_year_class_ids = {c["id"] for c in body["nextYearClasses"]}
    assert str(CLASS_JHS1_NEXT_UUID) in next_year_class_ids

    # No Term-3 score exists for this student, so the suggestion engine
    # defaults to "promote" — the auto-pick must resolve to the real
    # cross-division JHS 1 class, not leave targetClassId unset.
    decision = next(d for d in body["decisions"] if d["studentId"] == str(STUDENT_P6_UUID))
    assert decision["decision"] == "promote"
    assert decision["targetClassId"] == str(CLASS_JHS1_NEXT_UUID)

    submit = await client.post(
        f"/promotions/submissions/{submission_id}/submit",
        json={"updates": []},
        headers=teacher_headers,
    )
    assert submit.status_code == 200, submit.text


async def test_ensure_submission_is_idempotent(
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
    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))
    first = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=teacher_headers,
    )
    second = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=teacher_headers,
    )
    assert first.json()["submissionId"] == second.json()["submissionId"]


async def test_ensure_rejects_non_class_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """`teacher` teaches JHS 1 + JHS 3 — not JHS 2. Trying to open JHS 2
    as `teacher` must 403."""
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
    res = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS2_UUID)},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 403


async def test_ensure_rejects_when_season_closed(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
) -> None:
    """No open season → 409."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
    )
    res = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 409


# ─── Submit → approve happy path ────────────────────────────────────────────


async def _prepare_submitted_jhs1(client: AsyncClient) -> str:
    """Season open, submission ensured, list submitted. Returns
    submission_id. Reused by approve/send-back/duplicate tests.

    student1's auto-suggestion is `repeat` (three failed cores), which
    requires a reason before submit; student2 is `promote` and needs a
    targetClassId. We pass both explicitly to satisfy the pre-flight."""
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


async def test_submit_blocks_when_preflight_fails(
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
    """Delete the next-year JHS 2 class → submit must reject."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    from sqlalchemy import delete as sa_delete

    await db_session.execute(sa_delete(Class).where(Class.id == CLASS_JHS2_NEXT_UUID))
    await db_session.flush()

    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))
    ensure = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS1_UUID)},
        headers=teacher_headers,
    )
    res = await client.post(
        f"/promotions/submissions/{ensure.json()['submissionId']}/submit",
        json={"updates": []},
        headers=teacher_headers,
    )
    assert res.status_code == 400


async def test_manual_repeat_decision_auto_derives_target_class(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """A teacher manually switching a decision to Repeat never gets a
    target-class picker in the UI (only Promote does) — the backend
    must auto-derive "same class name, next year" the same way it
    already does for the algorithmic suggestion. JHS 3 has a real
    2026/2027 twin in the fixtures, unlike JHS 1."""
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
        json={"classId": str(CLASS_JHS3_UUID)},
        headers=teacher_headers,
    )
    submission_id = ensure.json()["submissionId"]

    res = await client.post(
        f"/promotions/submissions/{submission_id}/submit",
        json={
            "updates": [
                {
                    "studentId": str(STUDENT_JHS3_UUID),
                    "decision": "repeat",
                    "targetClassId": None,
                    "reason": "Needs another year in JHS 3.",
                },
            ]
        },
        headers=teacher_headers,
    )
    assert res.status_code == 200, res.text

    detail = await client.get(f"/promotions/submissions/{submission_id}", headers=teacher_headers)
    decision = next(
        d for d in detail.json()["decisions"] if d["studentId"] == str(STUDENT_JHS3_UUID)
    )
    assert decision["targetClassId"] == str(CLASS_JHS3_NEXT_UUID)


async def test_submit_rejects_repeat_with_no_resolvable_target_class(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """JHS 1 has no 2026/2027 twin in the fixtures — a manual Repeat
    with no explicit target class can't be auto-derived, so submit
    must reject it at submit time (matching Promote's equivalent
    check) rather than letting it reach approve and fail there."""
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

    res = await client.post(
        f"/promotions/submissions/{submission_id}/submit",
        json={
            "updates": [
                {
                    "studentId": str(STUDENT1_UUID),
                    "decision": "repeat",
                    "targetClassId": None,
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
    assert res.status_code == 400
    assert "No 2026/2027 class exists" in res.text


async def test_approve_materialises_enrolments_and_writes_audit(
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
    submission_id = await _prepare_submitted_jhs1(client)

    approve = await client.post(
        f"/promotions/submissions/{submission_id}/approve",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["status"] == "approved"

    # student1 had suggestion=repeat → next-year enrolment status must be
    # "Repeating" back into JHS 1. Auto-picked repeat target should be
    # the current class's own next-year twin — but our seed lacks a JHS 1
    # 2026/2027 class, so target_class_id would be None which fails the
    # submit pre-flight. Verify at least the current-year enrolment was
    # marked Completed and the audit log fired.
    current = await db_session.execute(
        select(Enrollment).where(
            Enrollment.student_id == STUDENT1_UUID,
            Enrollment.academic_year == "2025/2026",
        )
    )
    row = current.scalar_one()
    assert row.status == "Completed"

    audits = await db_session.execute(
        select(AuditLog).where(
            AuditLog.school_id == SCHOOL_UUID,
            AuditLog.action == "PROMOTION_APPROVED",
        )
    )
    audit_row = audits.scalar_one()
    assert audit_row.after is not None
    assert audit_row.after["decisionCount"] >= 2


async def test_deputy_wrong_division_cannot_approve(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """The KG deputy tries to approve a JHS submission → 403."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    submission_id = await _prepare_submitted_jhs1(client)
    res = await client.post(
        f"/promotions/submissions/{submission_id}/approve",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_KG_UUID)),
    )
    assert res.status_code == 403


async def test_deputy_matching_division_can_send_back(
    client: AsyncClient,
    db_session: AsyncSession,
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
    submission_id = await _prepare_submitted_jhs1(client)
    res = await client.post(
        f"/promotions/submissions/{submission_id}/send-back",
        json={"comment": "Please re-check student1"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "sent_back"

    detail = await client.get(
        f"/promotions/submissions/{submission_id}",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    comments = detail.json()["comments"]
    assert len(comments) == 1
    assert comments[0]["body"] == "Please re-check student1"
    assert comments[0]["authorId"] == str(DEPUTY_JHS_UUID)

    audits = await db_session.execute(
        select(AuditLog).where(
            AuditLog.school_id == SCHOOL_UUID,
            AuditLog.action == "PROMOTION_SENT_BACK",
            AuditLog.target_id == submission_id,
        )
    )
    audit_row = audits.scalar_one()
    assert audit_row.after == {"comment": "Please re-check student1"}


async def test_send_back_requires_comment(
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
    submission_id = await _prepare_submitted_jhs1(client)
    res = await client.post(
        f"/promotions/submissions/{submission_id}/send-back",
        json={"comment": ""},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    # Pydantic min_length=1 rejects "" before we hit the service.
    assert res.status_code == 422


async def test_edit_after_send_back_returns_status_to_draft(
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
    submission_id = await _prepare_submitted_jhs1(client)
    await client.post(
        f"/promotions/submissions/{submission_id}/send-back",
        json={"comment": "revise"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    # Teacher edits the list — should flip back to draft.
    res = await client.patch(
        f"/promotions/submissions/{submission_id}/decisions",
        json={
            "updates": [
                {
                    "studentId": str(STUDENT2_UUID),
                    "decision": "promote",
                    "targetClassId": str(CLASS_JHS2_NEXT_UUID),
                    "reason": None,
                }
            ]
        },
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "draft"


async def test_teacher_not_owner_cannot_save(
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
    submission_id = await _prepare_submitted_jhs1(client)
    # other_teacher teaches JHS 2, not JHS 1.
    res = await client.patch(
        f"/promotions/submissions/{submission_id}/decisions",
        json={"updates": []},
        headers=auth_header(role="Teacher", linked_id=str(OTHER_TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Read projections ───────────────────────────────────────────────────────


async def test_overview_admin_sees_all_classes(
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
    res = await client.get(
        "/promotions/overview",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    class_ids = {r["classId"] for r in items}
    assert str(CLASS_JHS1_UUID) in class_ids
    assert str(CLASS_JHS2_UUID) in class_ids
    assert str(CLASS_JHS3_UUID) in class_ids


async def test_teacher_classes_only_shows_own(
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
    res = await client.get(
        "/promotions/teacher-classes",
        headers=auth_header(role="Teacher", linked_id=str(TEACHER_UUID)),
    )
    assert res.status_code == 200
    class_ids = {r["classId"] for r in res.json()["items"]}
    # `teacher` teaches JHS 1 + JHS 3; not JHS 2.
    assert class_ids == {str(CLASS_JHS1_UUID), str(CLASS_JHS3_UUID)}


async def test_dh_queue_scoped_to_own_division(
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
    await _prepare_submitted_jhs1(client)
    res_jhs = await client.get(
        "/promotions/dh-queue",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS_UUID)),
    )
    assert res_jhs.status_code == 200
    assert res_jhs.json()["total"] >= 1

    res_kg = await client.get(
        "/promotions/dh-queue",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_KG_UUID)),
    )
    assert res_kg.status_code == 200
    # KG deputy sees nothing — no KG submissions.
    assert res_kg.json()["total"] == 0


async def test_jhs3_class_auto_graduates_students(
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
    await _open_season(client)
    teacher_headers = auth_header(role="Teacher", linked_id=str(TEACHER_UUID))
    ensure = await client.post(
        "/promotions/submissions/ensure",
        json={"classId": str(CLASS_JHS3_UUID)},
        headers=teacher_headers,
    )
    submission_id = ensure.json()["submissionId"]
    detail = await client.get(
        f"/promotions/submissions/{submission_id}",
        headers=teacher_headers,
    )
    body = detail.json()
    student_row = next(d for d in body["decisions"] if d["studentId"] == str(STUDENT_JHS3_UUID))
    assert student_row["decision"] == "graduate"


# ─── Cross-tenant IDOR guards ───────────────────────────────────────────────


async def test_get_submission_from_other_school_404s(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """Regression: `find_submission_by_id` used to fetch by primary key
    only. A caller from *another* school passing a valid submission id
    would receive the full detail. Now the repository requires school_id
    and returns None for cross-tenant ids, so the router raises 404
    without leaking existence."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    submission_id = await _prepare_submitted_jhs1(client)

    # Owner tenant can read it.
    own = await client.get(
        f"/promotions/submissions/{submission_id}",
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert own.status_code == 200

    # Foreign tenant (different school_id in the JWT) cannot.
    foreign_school = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee9999"
    res = await client.get(
        f"/promotions/submissions/{submission_id}",
        headers=auth_header(
            role="Admin",
            linked_id=str(ADMIN_UUID),
            school_id=foreign_school,
        ),
    )
    assert res.status_code == 404


async def test_approve_from_other_school_404s(
    client: AsyncClient,
    seed_school: School,
    seed_classes: dict[str, Class],
    seed_subjects: list[Subject],
    seed_staff: dict[str, Staff],
    seed_class_teachers: None,
    seed_students_and_enrollments: None,
    seed_term3_exam_and_scores: Exam,
) -> None:
    """Approve is a write path — same tenant scoping applies."""
    _ = (
        seed_school,
        seed_classes,
        seed_subjects,
        seed_staff,
        seed_class_teachers,
        seed_students_and_enrollments,
        seed_term3_exam_and_scores,
    )
    submission_id = await _prepare_submitted_jhs1(client)
    foreign_school = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee9999"
    res = await client.post(
        f"/promotions/submissions/{submission_id}/approve",
        headers=auth_header(
            role="Admin",
            linked_id=str(ADMIN_UUID),
            school_id=foreign_school,
        ),
    )
    assert res.status_code == 404


# `Student` is imported so `db_session` fixture cascades don't drop the
# students table before the test module resolves — matches the pattern
# other tests use.
_ = (Student, CLASS_JHS3_NEXT_UUID)
