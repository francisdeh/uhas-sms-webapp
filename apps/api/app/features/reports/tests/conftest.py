"""Fixtures for the Reports test suite.

Distinct UUID range (`33…`). Seeds a compact-but-realistic school:

  * 2 divisions (KG + JHS)
  * 3 classes for the current year — KG 1, JHS 1, JHS 2
  * 4 students — 2 boys and 2 girls, enrolled across the JHS classes
  * A KG teacher, a JHS class teacher, a JHS deputy, an Admin
  * A published Term-3 EndOfTerm exam with a handful of scores so the
    aggregate math has something to bite on
  * 3 lesson plans in different statuses so the counters tick
  * Today's attendance session with 3 present + 1 absent
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import jwt
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.attendance.model import AttendanceRecord, AttendanceSession
from app.features.classes.model import Class, ClassSubject, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam, Score
from app.features.lesson_plans.model import LessonPlan
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("33333333-3333-4333-8333-333333330001")

# Classes (all 2025/2026 unless noted).
CLASS_KG1 = UUID("33333333-3333-4333-8333-333333330101")
CLASS_JHS1 = UUID("33333333-3333-4333-8333-333333330102")
CLASS_JHS2 = UUID("33333333-3333-4333-8333-333333330103")

# Subjects.
SUB_MATH = UUID("33333333-3333-4333-8333-333333330201")
SUB_ENGL = UUID("33333333-3333-4333-8333-333333330202")

# Staff.
ADMIN_STAFF = UUID("33333333-3333-4333-8333-333333330301")
DEPUTY_JHS_STAFF = UUID("33333333-3333-4333-8333-333333330302")
DEPUTY_KG_STAFF = UUID("33333333-3333-4333-8333-333333330303")
TEACHER_JHS_STAFF = UUID("33333333-3333-4333-8333-333333330304")
# A JHS teacher who does NOT teach CLASS_JHS1 — used for the
# "teacher can't view another class" negative case.
FOREIGN_TEACHER_STAFF = UUID("33333333-3333-4333-8333-333333330305")

# Users.
ADMIN_USER = UUID("33333333-3333-4333-8333-333333330401")
DEPUTY_JHS_USER = UUID("33333333-3333-4333-8333-333333330402")
DEPUTY_KG_USER = UUID("33333333-3333-4333-8333-333333330403")
TEACHER_JHS_USER = UUID("33333333-3333-4333-8333-333333330404")
FOREIGN_TEACHER_USER = UUID("33333333-3333-4333-8333-333333330405")

# Students (all active + JHS 1 enrolled).
STUDENT_M1 = UUID("33333333-3333-4333-8333-333333330501")
STUDENT_M2 = UUID("33333333-3333-4333-8333-333333330502")
STUDENT_F1 = UUID("33333333-3333-4333-8333-333333330503")
STUDENT_F2 = UUID("33333333-3333-4333-8333-333333330504")
# One inactive student for the leavers counter.
STUDENT_INACTIVE = UUID("33333333-3333-4333-8333-333333330505")

# Guardian for the parent-count aggregate.
GUARDIAN_UUID = UUID("33333333-3333-4333-8333-333333330601")

# Published Term-3 EndOfTerm exam.
EXAM_UUID = UUID("33333333-3333-4333-8333-333333330701")

# Matches `ReportsService._today()` exactly (UTC, not local machine
# time) — `date.today()` disagrees with it for ~2 hours a day whenever
# local time has already rolled to the next calendar day but UTC
# hasn't, which made `test_school_stats_admin`'s "today's attendance"
# assertion flaky depending on what time of day the suite ran.
TODAY = datetime.now(UTC).date()


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
async def seed(db_session: AsyncSession) -> None:
    """One monolithic seed — every test in this suite exercises the
    same graph, so splitting fixtures adds no clarity."""
    db_session.add(
        School(
            id=SCHOOL_UUID,
            slug="test-school-rep",
            name="Test School (reports)",
            academic_year="2025/2026",
            current_term=3,
            grading_scale="GES_STANDARD",
            is_active=True,
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            Class(
                id=CLASS_KG1,
                slug="kg1-rep",
                school_id=SCHOOL_UUID,
                name="KG 1",
                division="KG",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_JHS1,
                slug="jhs1-rep",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year="2025/2026",
            ),
            Class(
                id=CLASS_JHS2,
                slug="jhs2-rep",
                school_id=SCHOOL_UUID,
                name="JHS 2",
                division="JHS",
                academic_year="2025/2026",
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Subject(
                id=SUB_MATH,
                slug="math-rep",
                school_id=SCHOOL_UUID,
                name="Mathematics",
                division="JHS",
                category="Core",
            ),
            Subject(
                id=SUB_ENGL,
                slug="engl-rep",
                school_id=SCHOOL_UUID,
                name="English",
                division="JHS",
                category="Core",
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-adm-rep",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="adm@rep.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_JHS_STAFF,
                slug="STAFF-dh-jhs-rep",
                school_id=SCHOOL_UUID,
                first_name="Yaw",
                last_name="DH-JHS",
                system_role="DeputyHead",
                division="JHS",
                email="dh-jhs@rep.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_KG_STAFF,
                slug="STAFF-dh-kg-rep",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="DH-KG",
                system_role="DeputyHead",
                division="KG",
                email="dh-kg@rep.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_JHS_STAFF,
                slug="STAFF-t-rep",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                rank="Senior Teacher",
                email="t@rep.test",
                is_active=True,
            ),
            Staff(
                id=FOREIGN_TEACHER_STAFF,
                slug="STAFF-tf-rep",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Foreign",
                system_role="Teacher",
                division="JHS",
                rank="Teacher",
                email="tf@rep.test",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    # JHS teacher owns JHS 1 as class-teacher + Maths teacher; nothing
    # for foreign teacher.
    db_session.add_all(
        [
            ClassTeacher(class_id=CLASS_JHS1, staff_id=TEACHER_JHS_STAFF, is_primary=True),
            ClassSubject(
                class_id=CLASS_JHS1,
                subject_id=SUB_MATH,
                teacher_id=TEACHER_JHS_STAFF,
            ),
            ClassSubject(class_id=CLASS_JHS1, subject_id=SUB_ENGL, teacher_id=None),
            # JHS 2 has one subject taught — used by the top-classes
            # sort even though no scores are recorded for it.
            ClassSubject(
                class_id=CLASS_JHS2,
                subject_id=SUB_MATH,
                teacher_id=None,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(
                id=ADMIN_USER,
                school_id=SCHOOL_UUID,
                email="adm@rep.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
            ),
            User(
                id=DEPUTY_JHS_USER,
                school_id=SCHOOL_UUID,
                email="dh-jhs@rep.test",
                role="DeputyHead",
                linked_id=DEPUTY_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=DEPUTY_KG_USER,
                school_id=SCHOOL_UUID,
                email="dh-kg@rep.test",
                role="DeputyHead",
                linked_id=DEPUTY_KG_STAFF,
                is_active=True,
            ),
            User(
                id=TEACHER_JHS_USER,
                school_id=SCHOOL_UUID,
                email="t@rep.test",
                role="Teacher",
                linked_id=TEACHER_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=FOREIGN_TEACHER_USER,
                school_id=SCHOOL_UUID,
                email="tf@rep.test",
                role="Teacher",
                linked_id=FOREIGN_TEACHER_STAFF,
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Student(
                id=STUDENT_M1,
                slug="STU-M1",
                school_id=SCHOOL_UUID,
                first_name="Kwesi",
                last_name="Male1",
                gender="Male",
                is_active=True,
            ),
            Student(
                id=STUDENT_M2,
                slug="STU-M2",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="Male2",
                gender="Male",
                is_active=True,
            ),
            Student(
                id=STUDENT_F1,
                slug="STU-F1",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Female1",
                gender="Female",
                is_active=True,
            ),
            Student(
                id=STUDENT_F2,
                slug="STU-F2",
                school_id=SCHOOL_UUID,
                first_name="Akosua",
                last_name="Female2",
                gender="Female",
                is_active=True,
            ),
            Student(
                id=STUDENT_INACTIVE,
                slug="STU-INA",
                school_id=SCHOOL_UUID,
                first_name="Kobi",
                last_name="Leaver",
                gender="Male",
                is_active=False,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            # 4 active students in JHS 1.
            Enrollment(
                student_id=STUDENT_M1,
                class_id=CLASS_JHS1,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_M2,
                class_id=CLASS_JHS1,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_F1,
                class_id=CLASS_JHS1,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_F2,
                class_id=CLASS_JHS1,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()

    # Parent-count aggregate wants at least one guardian link.
    from app.features.guardians.model import Guardian

    db_session.add(
        Guardian(
            id=GUARDIAN_UUID,
            slug="GRD-rep",
            school_id=SCHOOL_UUID,
            first_name="Ama",
            last_name="Parent",
            email="parent@rep.test",
        )
    )
    await db_session.flush()
    db_session.add(
        StudentGuardian(
            student_id=STUDENT_M1,
            guardian_id=GUARDIAN_UUID,
            relation="mother",
            is_primary=True,
        )
    )
    await db_session.flush()

    # Published Term-3 EndOfTerm exam + scores.
    db_session.add(
        Exam(
            id=EXAM_UUID,
            school_id=SCHOOL_UUID,
            name="Term 3 EOT 2025/2026",
            type="EndOfTerm",
            term=3,
            academic_year="2025/2026",
            is_published=True,
        )
    )
    await db_session.flush()

    # Scores: M1 posts strong grades; the other three are middling.
    # Aggregate = sum of grade numbers, lower better.
    db_session.add_all(
        [
            Score(
                exam_id=EXAM_UUID,
                student_id=STUDENT_M1,
                subject_id=SUB_MATH,
                total_score=90,
                grade="1",
            ),
            Score(
                exam_id=EXAM_UUID,
                student_id=STUDENT_M1,
                subject_id=SUB_ENGL,
                total_score=85,
                grade="2",
            ),
            Score(
                exam_id=EXAM_UUID,
                student_id=STUDENT_M2,
                subject_id=SUB_MATH,
                total_score=60,
                grade="4",
            ),
            Score(
                exam_id=EXAM_UUID,
                student_id=STUDENT_F1,
                subject_id=SUB_MATH,
                total_score=55,
                grade="5",
            ),
        ]
    )
    await db_session.flush()

    # Lesson plans in three different statuses on JHS classes.
    db_session.add_all(
        [
            LessonPlan(
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_JHS_STAFF,
                subject_id=SUB_MATH,
                class_id=CLASS_JHS1,
                term=3,
                week=1,
                topic="Fractions",
                status="draft",
            ),
            LessonPlan(
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_JHS_STAFF,
                subject_id=SUB_MATH,
                class_id=CLASS_JHS1,
                term=3,
                week=2,
                topic="Decimals",
                status="submitted",
            ),
            LessonPlan(
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_JHS_STAFF,
                subject_id=SUB_MATH,
                class_id=CLASS_JHS2,
                term=3,
                week=1,
                topic="Algebra",
                status="approved",
            ),
        ]
    )
    await db_session.flush()

    # Today's attendance for JHS 1 — 3 present, 1 absent.
    session_row = AttendanceSession(
        school_id=SCHOOL_UUID,
        class_id=CLASS_JHS1,
        date=TODAY,
        term=3,
    )
    db_session.add(session_row)
    await db_session.flush()
    db_session.add_all(
        [
            AttendanceRecord(session_id=session_row.id, student_id=STUDENT_M1, status="present"),
            AttendanceRecord(session_id=session_row.id, student_id=STUDENT_M2, status="late"),
            AttendanceRecord(session_id=session_row.id, student_id=STUDENT_F1, status="present"),
            AttendanceRecord(session_id=session_row.id, student_id=STUDENT_F2, status="absent"),
        ]
    )
    await db_session.flush()


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


def auth_header(
    *,
    role: str,
    user_id: UUID,
    linked_id: UUID | None,
) -> dict[str, str]:
    now = int(time.time())
    app_metadata: dict[str, Any] = {"role": role, "school_id": str(SCHOOL_UUID)}
    if linked_id is not None:
        app_metadata["linked_id"] = str(linked_id)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "iat": now,
            "exp": now + 3600,
            "email": "test@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
