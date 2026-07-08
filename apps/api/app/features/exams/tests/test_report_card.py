"""HTTP-level tests for `GET /students/{id}/report-card?examId=`.

Covers the role matrix (Admin, Parent, Teacher, DeputyHead), the
aggregate maths, the "skip fully-blank score rows" rule, and the
404 / 401 error paths.

Seeds sit in the `80808080-8080-4808-8808-…` range to avoid clashing
with other suites — brief pinned that range for this feature.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import ClassSubject
from app.features.exams.model import (
    ClassReportSubmission,
    Exam,
    Score,
    StudentReportRemark,
)
from app.features.exams.tests.conftest import (
    CLASS_TEACHER_A_UUID,
    CLASS_UUID,
    DEPUTY_JHS_UUID,
    DEPUTY_KG_UUID,
    GUARDIAN_UUID,
    OTHER_TEACHER_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    STUDENT_C_UUID,
    SUBJECT_UUID,
    _seed_exam,
    _seed_score,
    auth_header,
)
from app.features.school_terms.model import SchoolTerm

# `seed_actors` is a pytest fixture — conftest.py fixtures are
# auto-discovered by parameter name, no import needed.
from app.features.schools.model import School
from app.features.subjects.model import Subject
from app.main import app  # noqa: F401 — kept to force router registration

ENGLISH_SUBJECT_UUID = UUID("80808080-8080-4808-8808-080808080701")
SCIENCE_SUBJECT_UUID = UUID("80808080-8080-4808-8808-080808080702")

MISSING_STUDENT_UUID = UUID("80808080-8080-4808-8808-0808080807ff")
MISSING_EXAM_UUID = UUID("80808080-8080-4808-8808-0808080807fe")


@pytest_asyncio.fixture
async def seed_extra_subjects(db_session: AsyncSession, seed_school: School) -> None:
    """Two more JHS subjects so the aggregate maths test can exercise a
    mix of three graded rows (grades 1 + 2 + 3 → aggregate 6)."""
    _ = seed_school
    db_session.add_all(
        [
            Subject(
                id=ENGLISH_SUBJECT_UUID,
                slug="ENG",
                school_id=SCHOOL_UUID,
                name="English",
                division="JHS",
                category="Core",
            ),
            Subject(
                id=SCIENCE_SUBJECT_UUID,
                slug="SCI",
                school_id=SCHOOL_UUID,
                name="Science",
                division="JHS",
                category="Core",
            ),
        ]
    )
    await db_session.flush()


def _url(student_id: UUID, exam_id: UUID) -> str:
    return f"/students/{student_id}/report-card?examId={exam_id}"


# ─── Auth / role scoping ─────────────────────────────────────────────────────


async def test_missing_auth_returns_401(client: AsyncClient) -> None:
    res = await client.get(_url(STUDENT_A_UUID, MISSING_EXAM_UUID))
    assert res.status_code == 401


async def test_admin_can_fetch_any_student_report(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["student"]["id"] == str(STUDENT_A_UUID)
    assert body["exam"]["id"] == str(exam.id)
    assert body["exam"]["isPublished"] is True


async def test_admin_can_fetch_unpublished_exam(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """Admin needs to review scores before publishing — no publish gate."""
    exam = await _seed_exam(db_session, is_published=False)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["exam"]["isPublished"] is False


async def test_parent_can_fetch_own_child(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 200, res.text
    assert res.json()["student"]["id"] == str(STUDENT_A_UUID)


async def test_parent_cannot_fetch_unpublished_exam(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """Server-side mirror of the frontend's publish gate — a parent
    hitting the API directly must not see scores before publish."""
    exam = await _seed_exam(db_session, is_published=False)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 403


async def test_parent_cannot_fetch_unrelated_child(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_B_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 403


async def test_teacher_can_fetch_own_class_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_A_UUID),
    )
    assert res.status_code == 200, res.text
    assert res.json()["student"]["className"] == "JHS 1"


async def test_teacher_cannot_fetch_other_class_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Teacher", linked_id=OTHER_TEACHER_UUID),
    )
    assert res.status_code == 403


async def test_subject_teacher_can_fetch_student_in_their_class(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """`class_subjects` teachers are teachers of the class too — same
    gate the attendance summary uses."""
    exam = await _seed_exam(db_session)
    db_session.add(
        ClassSubject(
            class_id=CLASS_UUID,
            subject_id=SUBJECT_UUID,
            teacher_id=OTHER_TEACHER_UUID,
        )
    )
    await db_session.flush()
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Teacher", linked_id=OTHER_TEACHER_UUID),
    )
    assert res.status_code == 200, res.text


async def test_deputy_can_fetch_own_division_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_JHS_UUID),
    )
    assert res.status_code == 200, res.text


async def test_deputy_cannot_fetch_other_division_student(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_KG_UUID),
    )
    assert res.status_code == 403


# ─── Response body ───────────────────────────────────────────────────────────


async def test_report_omits_scores_with_no_components(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    seed_extra_subjects: None,
) -> None:
    """A saved-but-fully-null score row (all components None) is skipped
    on the report card — matches the "blank on the report" rule."""
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=92,
        grade="1",
        interpretation="Highest",
    )
    # Fully-blank row — must NOT appear in `scores`.
    db_session.add(
        Score(
            exam_id=exam.id,
            student_id=STUDENT_A_UUID,
            subject_id=ENGLISH_SUBJECT_UUID,
            cat1=None,
            cat2=None,
            project_work=None,
            group_work=None,
            exam_score=None,
        )
    )
    await db_session.flush()

    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    subjects = [row["subjectId"] for row in res.json()["scores"]]
    assert str(SUBJECT_UUID) in subjects
    assert str(ENGLISH_SUBJECT_UUID) not in subjects


async def test_aggregate_is_bece_style_sum_of_grades(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
    seed_extra_subjects: None,
) -> None:
    """Grades 1 + 2 + 3 → aggregate 6. Lower is better."""
    exam = await _seed_exam(db_session)
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SUBJECT_UUID,
        total=95,
        grade="1",
        interpretation="Highest",
    )
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=ENGLISH_SUBJECT_UUID,
        total=85,
        grade="2",
        interpretation="Higher",
    )
    await _seed_score(
        db_session,
        exam_id=exam.id,
        student_id=STUDENT_A_UUID,
        subject_id=SCIENCE_SUBJECT_UUID,
        total=72,
        grade="3",
        interpretation="High",
    )
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["aggregate"] == 6


async def test_report_includes_both_class_teachers(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    names = res.json()["classTeachers"]
    assert "Akosua First" in names
    assert "Kojo Second" in names
    assert len(names) == 2


async def test_report_includes_hos_comment_when_present(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    db_session.add(
        ClassReportSubmission(
            exam_id=exam.id,
            class_id=CLASS_UUID,
            status="submitted",
            head_of_school_comment="Well done everyone.",
        )
    )
    await db_session.flush()
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["headOfSchoolComment"] == "Well done everyone."


async def test_report_includes_per_student_remark_when_present(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    db_session.add(
        StudentReportRemark(
            exam_id=exam.id,
            student_id=STUDENT_A_UUID,
            class_teacher_remark="Excellent progress this term.",
        )
    )
    await db_session.flush()
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["classTeacherRemark"] == "Excellent progress this term."


# ─── Vacation + reopening dates (from school_terms) ──────────────────────────


async def _seed_term(
    db_session: AsyncSession,
    *,
    academic_year: str,
    term: int,
    start: date,
    end: date,
) -> None:
    db_session.add(
        SchoolTerm(
            school_id=SCHOOL_UUID,
            academic_year=academic_year,
            term=term,
            start_date=start,
            end_date=end,
        )
    )
    await db_session.flush()


async def test_vacation_and_reopening_from_school_terms(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """Vacation = this term's end date; reopening = the next term's start."""
    exam = await _seed_exam(db_session)  # term 2, 2025/2026
    await _seed_term(
        db_session,
        academic_year="2025/2026",
        term=2,
        start=date(2026, 1, 6),
        end=date(2026, 4, 10),
    )
    await _seed_term(
        db_session,
        academic_year="2025/2026",
        term=3,
        start=date(2026, 5, 5),
        end=date(2026, 8, 1),
    )
    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vacationDate"] == "2026-04-10"
    assert body["reopeningDate"] == "2026-05-05"


async def test_term_three_reopening_rolls_to_next_year(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """Term 3's reopening comes from term 1 of the NEXT academic year."""
    exam = Exam(
        school_id=SCHOOL_UUID,
        name="Term 3 End of Term",
        type="EndOfTerm",
        term=3,
        academic_year="2025/2026",
        is_published=True,
    )
    db_session.add(exam)
    await db_session.flush()
    await _seed_term(
        db_session,
        academic_year="2025/2026",
        term=3,
        start=date(2026, 5, 5),
        end=date(2026, 8, 1),
    )
    await _seed_term(
        db_session,
        academic_year="2026/2027",
        term=1,
        start=date(2026, 9, 8),
        end=date(2026, 12, 18),
    )
    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vacationDate"] == "2026-08-01"
    assert body["reopeningDate"] == "2026-09-08"


async def test_dates_null_when_terms_unset(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """No school_terms rows → both date fields are null, no crash."""
    exam = await _seed_exam(db_session)
    res = await client.get(_url(STUDENT_A_UUID, exam.id), headers=auth_header(role="Admin"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["vacationDate"] is None
    assert body["reopeningDate"] is None


# ─── Errors ──────────────────────────────────────────────────────────────────


async def test_missing_exam_returns_404(
    client: AsyncClient,
    seed_actors: None,
) -> None:
    res = await client.get(
        _url(STUDENT_A_UUID, MISSING_EXAM_UUID),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404


async def test_missing_student_returns_404(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(MISSING_STUDENT_UUID, exam.id),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404


async def test_parent_can_fetch_midterm_report(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    """Parents are allowed to view MidTerm reports too — the brief keeps
    both exam types open to guardians."""
    exam = Exam(
        school_id=SCHOOL_UUID,
        name="Term 2 Mid-Term",
        type="MidTerm",
        term=2,
        academic_year="2025/2026",
        is_published=True,
    )
    db_session.add(exam)
    await db_session.flush()
    res = await client.get(
        _url(STUDENT_A_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 200, res.text
    assert res.json()["exam"]["type"] == "MidTerm"


async def test_unrelated_student_c_not_reachable_by_parent(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_actors: None,
) -> None:
    _ = STUDENT_C_UUID  # Ama's parent is not linked to Yaa either.
    exam = await _seed_exam(db_session)
    res = await client.get(
        _url(STUDENT_C_UUID, exam.id),
        headers=auth_header(role="Parent", linked_id=GUARDIAN_UUID),
    )
    assert res.status_code == 403
