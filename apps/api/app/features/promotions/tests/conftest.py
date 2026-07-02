"""Shared fixtures for the Promotions integration tests.

Distinct UUID range (`ff…`) keeps this suite composable with the
lesson_plans/schemes/assignments suites when the full pytest run seeds
them in the same transaction.

The fixture graph mirrors the real domain — school → classes → subjects
→ staff (Admin, DeputyHead JHS, DeputyHead KG, 2x Teacher) → students
→ enrollments → class_teachers → Term-3 EndOfTerm exam. Once seeded a
test can exercise any state-machine transition against real joins.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import date
from typing import Any
from uuid import UUID

import jwt
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam, Score
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0001")

# Two classes in JHS for the promote/repeat flows (a Primary 6 flow would
# double the seed count for no extra coverage).
CLASS_JHS1_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0101")
CLASS_JHS2_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0102")
CLASS_JHS3_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0103")
# Next-year targets (2026/2027).
CLASS_JHS2_NEXT_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0201")
CLASS_JHS3_NEXT_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0202")

SUB_MATH_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0301")
SUB_ENGL_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0302")
SUB_SCI_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0303")

ADMIN_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0401")
DEPUTY_JHS_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0402")
DEPUTY_KG_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0403")
TEACHER_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0404")
OTHER_TEACHER_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0405")

STUDENT1_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0501")
STUDENT2_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0502")
STUDENT3_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0503")
STUDENT_JHS3_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0504")

EXAM_TERM3_UUID = UUID("ffffffff-ffff-4fff-8fff-ffffffff0601")

USER_UUID = UUID("00000000-0000-0000-0000-0000000000ff")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        s = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield s
        finally:
            await s.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def seed_school(db_session: AsyncSession) -> School:
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-prom",
        name="Test School (promotions)",
        academic_year="2025/2026",
        current_term=3,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_classes(db_session: AsyncSession, seed_school: School) -> dict[str, Class]:
    """Current-year (2025/26) + next-year (2026/27) classes for JHS."""
    rows = [
        Class(
            id=CLASS_JHS1_UUID,
            slug="jhs1-25",
            school_id=SCHOOL_UUID,
            name="JHS 1",
            division="JHS",
            academic_year="2025/2026",
        ),
        Class(
            id=CLASS_JHS2_UUID,
            slug="jhs2-25",
            school_id=SCHOOL_UUID,
            name="JHS 2",
            division="JHS",
            academic_year="2025/2026",
        ),
        Class(
            id=CLASS_JHS3_UUID,
            slug="jhs3-25",
            school_id=SCHOOL_UUID,
            name="JHS 3",
            division="JHS",
            academic_year="2025/2026",
        ),
        Class(
            id=CLASS_JHS2_NEXT_UUID,
            slug="jhs2-26",
            school_id=SCHOOL_UUID,
            name="JHS 2",
            division="JHS",
            academic_year="2026/2027",
        ),
        Class(
            id=CLASS_JHS3_NEXT_UUID,
            slug="jhs3-26",
            school_id=SCHOOL_UUID,
            name="JHS 3",
            division="JHS",
            academic_year="2026/2027",
        ),
    ]
    db_session.add_all(rows)
    await db_session.flush()
    return {
        "jhs1_25": rows[0],
        "jhs2_25": rows[1],
        "jhs3_25": rows[2],
        "jhs2_26": rows[3],
        "jhs3_26": rows[4],
    }


@pytest_asyncio.fixture
async def seed_subjects(db_session: AsyncSession, seed_school: School) -> list[Subject]:
    """Three core JHS subjects — enough to hit the 3-fails-→-repeat
    threshold in tests."""
    rows = [
        Subject(
            id=SUB_MATH_UUID,
            slug="MATH",
            school_id=SCHOOL_UUID,
            name="Mathematics",
            division="JHS",
            category="Core",
        ),
        Subject(
            id=SUB_ENGL_UUID,
            slug="ENGL",
            school_id=SCHOOL_UUID,
            name="English",
            division="JHS",
            category="Core",
        ),
        Subject(
            id=SUB_SCI_UUID,
            slug="SCI",
            school_id=SCHOOL_UUID,
            name="Science",
            division="JHS",
            category="Core",
        ),
    ]
    db_session.add_all(rows)
    await db_session.flush()
    return rows


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> dict[str, Staff]:
    """Every role that appears in the auth matrix."""
    admin = Staff(
        id=ADMIN_UUID,
        slug="STAFF-adm",
        school_id=SCHOOL_UUID,
        first_name="Adae",
        last_name="Admin",
        system_role="Admin",
        email="admin@promotions.test",
        is_active=True,
    )
    deputy_jhs = Staff(
        id=DEPUTY_JHS_UUID,
        slug="STAFF-dh-jhs",
        school_id=SCHOOL_UUID,
        first_name="Yaw",
        last_name="Deputy-JHS",
        system_role="DeputyHead",
        division="JHS",
        email="dh-jhs@promotions.test",
        is_active=True,
    )
    deputy_kg = Staff(
        id=DEPUTY_KG_UUID,
        slug="STAFF-dh-kg",
        school_id=SCHOOL_UUID,
        first_name="Efua",
        last_name="Deputy-KG",
        system_role="DeputyHead",
        division="KG",
        email="dh-kg@promotions.test",
        is_active=True,
    )
    teacher = Staff(
        id=TEACHER_UUID,
        slug="STAFF-t1",
        school_id=SCHOOL_UUID,
        first_name="Kwame",
        last_name="Teacher",
        system_role="Teacher",
        division="JHS",
        email="teacher@promotions.test",
        is_active=True,
    )
    other = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-t2",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Otherteacher",
        system_role="Teacher",
        division="JHS",
        email="other@promotions.test",
        is_active=True,
    )
    db_session.add_all([admin, deputy_jhs, deputy_kg, teacher, other])
    await db_session.flush()
    return {
        "admin": admin,
        "deputy_jhs": deputy_jhs,
        "deputy_kg": deputy_kg,
        "teacher": teacher,
        "other_teacher": other,
    }


@pytest_asyncio.fixture
async def seed_class_teachers(
    db_session: AsyncSession,
    seed_classes: dict[str, Class],
    seed_staff: dict[str, Staff],
) -> None:
    """`teacher` teaches JHS 1 (primary) and JHS 3; `other_teacher`
    teaches JHS 2 — used for the "wrong class teacher" negative case."""
    _ = seed_staff
    db_session.add_all(
        [
            ClassTeacher(class_id=CLASS_JHS1_UUID, staff_id=TEACHER_UUID, is_primary=True),
            ClassTeacher(class_id=CLASS_JHS3_UUID, staff_id=TEACHER_UUID, is_primary=False),
            ClassTeacher(class_id=CLASS_JHS2_UUID, staff_id=OTHER_TEACHER_UUID, is_primary=True),
        ]
    )
    await db_session.flush()


@pytest_asyncio.fixture
async def seed_students_and_enrollments(
    db_session: AsyncSession,
    seed_classes: dict[str, Class],
) -> None:
    """Two students in JHS 1 (student1 with 3 failed cores → repeat
    suggestion; student2 with all passing → promote suggestion) and one
    in JHS 3 (auto-graduate)."""
    _ = seed_classes
    db_session.add_all(
        [
            Student(
                id=STUDENT1_UUID,
                slug="STUDENT-001",
                school_id=SCHOOL_UUID,
                first_name="Kofi",
                last_name="Failing",
                is_active=True,
            ),
            Student(
                id=STUDENT2_UUID,
                slug="STUDENT-002",
                school_id=SCHOOL_UUID,
                first_name="Akosua",
                last_name="Passing",
                is_active=True,
            ),
            Student(
                id=STUDENT3_UUID,
                slug="STUDENT-003",
                school_id=SCHOOL_UUID,
                first_name="Yaa",
                last_name="Middling",
                is_active=True,
            ),
            Student(
                id=STUDENT_JHS3_UUID,
                slug="STUDENT-J3",
                school_id=SCHOOL_UUID,
                first_name="Kwabena",
                last_name="Graduate",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT1_UUID,
                class_id=CLASS_JHS1_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT2_UUID,
                class_id=CLASS_JHS1_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            # student3 in JHS 2 — used as an "other class" for wrong-teacher
            # checks; not in the JHS 1 submission.
            Enrollment(
                student_id=STUDENT3_UUID,
                class_id=CLASS_JHS2_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_JHS3_UUID,
                class_id=CLASS_JHS3_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()


@pytest_asyncio.fixture
async def seed_term3_exam_and_scores(
    db_session: AsyncSession,
    seed_school: School,
    seed_subjects: list[Subject],
    seed_students_and_enrollments: None,
) -> Exam:
    """Published Term-3 EndOfTerm exam with scores that trigger a
    repeat suggestion for `student1` and a promote suggestion for
    `student2`."""
    _ = (seed_school, seed_subjects, seed_students_and_enrollments)
    exam = Exam(
        id=EXAM_TERM3_UUID,
        school_id=SCHOOL_UUID,
        name="Term 3 End-of-Term 2025/2026",
        type="EndOfTerm",
        term=3,
        academic_year="2025/2026",
        is_published=True,
    )
    db_session.add(exam)
    await db_session.flush()

    # student1 fails all three core subjects → repeat.
    # student2 passes all three → promote.
    db_session.add_all(
        [
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT1_UUID,
                subject_id=SUB_MATH_UUID,
                total_score=30,
            ),
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT1_UUID,
                subject_id=SUB_ENGL_UUID,
                total_score=25,
            ),
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT1_UUID,
                subject_id=SUB_SCI_UUID,
                total_score=35,
            ),
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT2_UUID,
                subject_id=SUB_MATH_UUID,
                total_score=75,
            ),
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT2_UUID,
                subject_id=SUB_ENGL_UUID,
                total_score=65,
            ),
            Score(
                exam_id=EXAM_TERM3_UUID,
                student_id=STUDENT2_UUID,
                subject_id=SUB_SCI_UUID,
                total_score=80,
            ),
        ]
    )
    await db_session.flush()
    return exam


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


def mint_jwt(
    *,
    role: str = "Admin",
    school_id: UUID | str | None = SCHOOL_UUID,
    user_id: UUID | str = USER_UUID,
    linked_id: UUID | str | None = ADMIN_UUID,
    expires_in: int = 3600,
) -> str:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role}
    if school_id is not None:
        app_metadata["school_id"] = str(school_id)
    if linked_id is not None:
        app_metadata["linked_id"] = str(linked_id)
    return jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + expires_in,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


def auth_header(**kwargs: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {mint_jwt(**kwargs)}"}
