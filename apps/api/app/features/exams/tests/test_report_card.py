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

from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.model import (
    ClassReportSubmission,
    Exam,
    Score,
    StudentReportRemark,
)
from app.features.exams.tests.conftest import (
    CLASS_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    STUDENT_C_UUID,
    SUBJECT_UUID,
    auth_header,
)
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.main import app  # noqa: F401 — kept to force router registration

GUARDIAN_UUID = UUID("80808080-8080-4808-8808-080808080401")
OTHER_GUARDIAN_UUID = UUID("80808080-8080-4808-8808-080808080402")
CLASS_TEACHER_A_UUID = UUID("80808080-8080-4808-8808-080808080501")
CLASS_TEACHER_B_UUID = UUID("80808080-8080-4808-8808-080808080502")
OTHER_TEACHER_UUID = UUID("80808080-8080-4808-8808-080808080503")
DEPUTY_JHS_UUID = UUID("80808080-8080-4808-8808-080808080504")
DEPUTY_KG_UUID = UUID("80808080-8080-4808-8808-080808080505")

OTHER_CLASS_UUID = UUID("80808080-8080-4808-8808-080808080601")
OTHER_STUDENT_UUID = UUID("80808080-8080-4808-8808-080808080602")

ENGLISH_SUBJECT_UUID = UUID("80808080-8080-4808-8808-080808080701")
SCIENCE_SUBJECT_UUID = UUID("80808080-8080-4808-8808-080808080702")

MISSING_STUDENT_UUID = UUID("80808080-8080-4808-8808-0808080807ff")
MISSING_EXAM_UUID = UUID("80808080-8080-4808-8808-0808080807fe")


@pytest_asyncio.fixture
async def seed_actors(
    db_session: AsyncSession,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_subject: Subject,
) -> None:
    """Guardians (linked + unrelated), two class teachers on the seed
    class, an other-class teacher, deputies for JHS + KG divisions, and
    an unrelated KG class + student for cross-division checks."""
    _ = (seed_school, seed_class, seed_students, seed_subject)
    parent = Guardian(
        id=GUARDIAN_UUID,
        slug="GRD-RC-001",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Parent",
        email="efua.rc@example.com",
    )
    unrelated_parent = Guardian(
        id=OTHER_GUARDIAN_UUID,
        slug="GRD-RC-002",
        school_id=SCHOOL_UUID,
        first_name="Kwame",
        last_name="Stranger",
        email="kwame.rc@example.com",
    )
    teacher_a = Staff(
        id=CLASS_TEACHER_A_UUID,
        slug="STAFF-RC-CT1",
        school_id=SCHOOL_UUID,
        first_name="Akosua",
        last_name="First",
        system_role="Teacher",
        division="JHS",
        is_active=True,
    )
    teacher_b = Staff(
        id=CLASS_TEACHER_B_UUID,
        slug="STAFF-RC-CT2",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Second",
        system_role="Teacher",
        division="JHS",
        is_active=True,
    )
    other_teacher = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-RC-OTH",
        school_id=SCHOOL_UUID,
        first_name="Yaw",
        last_name="Other",
        system_role="Teacher",
        division="JHS",
        is_active=True,
    )
    deputy_jhs = Staff(
        id=DEPUTY_JHS_UUID,
        slug="STAFF-RC-DHJ",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="DeputyJhs",
        system_role="DeputyHead",
        division="JHS",
        is_active=True,
    )
    deputy_kg = Staff(
        id=DEPUTY_KG_UUID,
        slug="STAFF-RC-DHK",
        school_id=SCHOOL_UUID,
        first_name="Yaa",
        last_name="DeputyKg",
        system_role="DeputyHead",
        division="KG",
        is_active=True,
    )
    db_session.add_all(
        [parent, unrelated_parent, teacher_a, teacher_b, other_teacher, deputy_jhs, deputy_kg]
    )
    await db_session.flush()

    db_session.add_all(
        [
            StudentGuardian(
                student_id=STUDENT_A_UUID,
                guardian_id=GUARDIAN_UUID,
                relation="mother",
                is_primary=True,
            ),
            ClassTeacher(class_id=CLASS_UUID, staff_id=CLASS_TEACHER_A_UUID, is_primary=True),
            ClassTeacher(class_id=CLASS_UUID, staff_id=CLASS_TEACHER_B_UUID, is_primary=False),
        ]
    )
    await db_session.flush()

    other_class = Class(
        id=OTHER_CLASS_UUID,
        slug="class-kg1",
        school_id=SCHOOL_UUID,
        name="KG 1",
        division="KG",
        academic_year="2025/2026",
    )
    db_session.add(other_class)
    await db_session.flush()

    other_student = Student(
        id=OTHER_STUDENT_UUID,
        slug="UHAS-2025-0099",
        school_id=SCHOOL_UUID,
        first_name="Kofi",
        last_name="Kg",
        dob=date(2019, 5, 1),
        gender="Male",
        is_active=True,
    )
    db_session.add(other_student)
    await db_session.flush()

    db_session.add(
        Enrollment(
            student_id=OTHER_STUDENT_UUID,
            class_id=OTHER_CLASS_UUID,
            academic_year="2025/2026",
            status="Active",
            enrollment_date=date(2025, 9, 8),
        )
    )
    await db_session.flush()


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


async def _seed_exam(db_session: AsyncSession, *, is_published: bool = True) -> Exam:
    exam = Exam(
        school_id=SCHOOL_UUID,
        name="Term 2 End of Term",
        type="EndOfTerm",
        term=2,
        academic_year="2025/2026",
        is_published=is_published,
    )
    db_session.add(exam)
    await db_session.flush()
    return exam


async def _seed_score(
    db_session: AsyncSession,
    *,
    exam_id: UUID,
    student_id: UUID,
    subject_id: UUID,
    total: int,
    grade: str,
    interpretation: str,
) -> None:
    """Insert a materialised score row directly — bypassing the
    upsert-batch computation so tests can nail an exact grade."""
    db_session.add(
        Score(
            exam_id=exam_id,
            student_id=student_id,
            subject_id=subject_id,
            cat1=10,
            cat2=10,
            project_work=10,
            group_work=10,
            exam_score=total,
            total_score=total,
            grade=grade,
            interpretation=interpretation,
        )
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
