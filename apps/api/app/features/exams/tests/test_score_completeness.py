"""HTTP tests for GET /exams/{id}/score-completeness/{class_id}.

Reuses the shared class/students fixtures from conftest and layers a
mixed-completeness graph: four class-subjects on JHS 1 — one fully
graded, one partial, one untouched, and one with no teacher assigned —
across a 3-student roster, so the per-subject status + counts and the
class-teacher/Admin/Deputy gate can all be asserted.
"""

from __future__ import annotations

from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import ClassSubject, ClassTeacher
from app.features.exams.model import Exam, Score
from app.features.exams.tests.conftest import (
    CLASS_UUID,
    SCHOOL_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    STUDENT_C_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.subjects.model import Subject

# Distinct pinned range for this suite.
CLASS_TEACHER_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0201")
NON_TEACHER_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0202")
DEPUTY_KG_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0203")
T_MATHS_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0301")
T_ENGLISH_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0302")
T_SCIENCE_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0303")
SUBJ_MATHS_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0401")
SUBJ_ENGLISH_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0402")
SUBJ_SCIENCE_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0403")
SUBJ_HISTORY_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0404")
EXAM_UUID = UUID("4a4a4a4a-4a4a-4a4a-8a4a-4a4a4a4a0501")


def _staff(
    staff_id: UUID, slug: str, first: str, role: str = "Teacher", division: str = "JHS"
) -> Staff:
    return Staff(
        id=staff_id,
        slug=slug,
        school_id=SCHOOL_UUID,
        first_name=first,
        last_name="Teacher",
        system_role=role,
        division=division,
        is_active=True,
    )


def _subject(subject_id: UUID, slug: str, name: str) -> Subject:
    return Subject(
        id=subject_id,
        slug=slug,
        school_id=SCHOOL_UUID,
        name=name,
        division="JHS",
        category="Core",
    )


def _graded(student_id: UUID, subject_id: UUID) -> Score:
    return Score(
        exam_id=EXAM_UUID,
        student_id=student_id,
        subject_id=subject_id,
        exam_score=70,
        total_score=70,
        grade="3",
        interpretation="High",
    )


@pytest_asyncio.fixture
async def seed_graph(
    db_session: AsyncSession,
    seed_school: School,
    seed_class: object,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_school, seed_class, seed_students)
    # Class teacher (can view) + a teacher who doesn't teach this class + a KG deputy.
    db_session.add_all(
        [
            _staff(CLASS_TEACHER_UUID, "STAFF-SC-CT", "Owner"),
            _staff(NON_TEACHER_UUID, "STAFF-SC-NON", "Outsider"),
            _staff(DEPUTY_KG_UUID, "STAFF-SC-DHKG", "Kgdeputy", role="DeputyHead", division="KG"),
            _staff(T_MATHS_UUID, "STAFF-SC-M", "Maths"),
            _staff(T_ENGLISH_UUID, "STAFF-SC-E", "English"),
            _staff(T_SCIENCE_UUID, "STAFF-SC-S", "Science"),
        ]
    )
    db_session.add_all(
        [
            _subject(SUBJ_MATHS_UUID, "SC-MATH", "Mathematics"),
            _subject(SUBJ_ENGLISH_UUID, "SC-ENG", "English Language"),
            _subject(SUBJ_SCIENCE_UUID, "SC-SCI", "Science"),
            _subject(SUBJ_HISTORY_UUID, "SC-HIST", "History"),
        ]
    )
    await db_session.flush()

    db_session.add(ClassTeacher(class_id=CLASS_UUID, staff_id=CLASS_TEACHER_UUID, is_primary=True))
    db_session.add_all(
        [
            ClassSubject(class_id=CLASS_UUID, subject_id=SUBJ_MATHS_UUID, teacher_id=T_MATHS_UUID),
            ClassSubject(
                class_id=CLASS_UUID, subject_id=SUBJ_ENGLISH_UUID, teacher_id=T_ENGLISH_UUID
            ),
            ClassSubject(
                class_id=CLASS_UUID, subject_id=SUBJ_SCIENCE_UUID, teacher_id=T_SCIENCE_UUID
            ),
            # History: no teacher assigned.
            ClassSubject(class_id=CLASS_UUID, subject_id=SUBJ_HISTORY_UUID, teacher_id=None),
        ]
    )
    db_session.add(
        Exam(
            id=EXAM_UUID,
            school_id=SCHOOL_UUID,
            name="Term 2 End of Term",
            type="EndOfTerm",
            term=2,
            academic_year="2025/2026",
            is_published=False,
        )
    )
    await db_session.flush()

    # Maths: all 3 graded → complete. English: 1 graded → partial. Science + History: none.
    db_session.add_all(
        [
            _graded(STUDENT_A_UUID, SUBJ_MATHS_UUID),
            _graded(STUDENT_B_UUID, SUBJ_MATHS_UUID),
            _graded(STUDENT_C_UUID, SUBJ_MATHS_UUID),
            _graded(STUDENT_A_UUID, SUBJ_ENGLISH_UUID),
        ]
    )
    await db_session.flush()


def _url() -> str:
    return f"/exams/{EXAM_UUID}/score-completeness/{CLASS_UUID}"


async def test_completeness_mixed_states(client: AsyncClient, seed_graph: None) -> None:
    res = await client.get(
        _url(), headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID)
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["rosterCount"] == 3
    by_name = {r["subjectName"]: r for r in body["subjects"]}

    assert by_name["Mathematics"]["status"] == "complete"
    assert by_name["Mathematics"]["enteredCount"] == 3
    assert by_name["Mathematics"]["teacherName"] == "Maths Teacher"

    assert by_name["English Language"]["status"] == "partial"
    assert by_name["English Language"]["enteredCount"] == 1

    assert by_name["Science"]["status"] == "not_started"
    assert by_name["Science"]["enteredCount"] == 0

    # History has no teacher assigned.
    assert by_name["History"]["status"] == "not_started"
    assert by_name["History"]["teacherName"] is None
    assert by_name["History"]["teacherId"] is None


async def test_completeness_admin_allowed(client: AsyncClient, seed_graph: None) -> None:
    res = await client.get(_url(), headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert len(res.json()["subjects"]) == 4


async def test_completeness_non_class_teacher_forbidden(
    client: AsyncClient, seed_graph: None
) -> None:
    res = await client.get(_url(), headers=auth_header(role="Teacher", linked_id=NON_TEACHER_UUID))
    assert res.status_code == 403


async def test_completeness_other_division_deputy_forbidden(
    client: AsyncClient, seed_graph: None
) -> None:
    # KG deputy on a JHS class.
    res = await client.get(_url(), headers=auth_header(role="DeputyHead", linked_id=DEPUTY_KG_UUID))
    assert res.status_code == 403


async def test_completeness_requires_auth(client: AsyncClient, seed_school: School) -> None:
    res = await client.get(_url())
    assert res.status_code == 401
