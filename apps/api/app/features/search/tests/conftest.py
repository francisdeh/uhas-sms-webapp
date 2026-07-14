"""Fixtures for the global-search test suite.

Distinct UUID range (`30303030-…`). Seeds one school + a compact
graph that exercises every role path:

  * 4 classes across three divisions (KG 1, JHS 1, JHS 2, Primary 3 A)
  * 4 staff — Admin (no division), JHS Deputy, JHS Teacher (on JHS 1),
    and a division-less staff whose only distinguishing string is an
    email match ("findme@special.test") for the email-search test
  * 5 "Amaru"-first-name students distributed across the classes so
    each role gate produces a distinct subset. The parent's linked
    child sits in JHS 2 to demonstrate that guardian scoping wins even
    when the class is inside the deputy's division
  * 10 additional "Capacity"-first-name students purely to prove the
    per-domain 8-result ceiling
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
from app.features.fees.model import FeeItem
from app.features.guardians.model import Guardian
from app.features.lesson_plans.model import LessonPlan
from app.features.schemes.model import Scheme
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.features.users.model import User
from app.main import app

SCHOOL_UUID = UUID("30303030-3030-4303-8303-303030300001")

# Classes.
CLASS_KG1 = UUID("30303030-3030-4303-8303-303030300101")
CLASS_JHS1 = UUID("30303030-3030-4303-8303-303030300102")
CLASS_JHS2 = UUID("30303030-3030-4303-8303-303030300103")
CLASS_LP3A = UUID("30303030-3030-4303-8303-303030300104")

# Staff.
ADMIN_STAFF = UUID("30303030-3030-4303-8303-303030300301")
DEPUTY_JHS_STAFF = UUID("30303030-3030-4303-8303-303030300302")
TEACHER_JHS_STAFF = UUID("30303030-3030-4303-8303-303030300303")
EMAIL_ONLY_STAFF = UUID("30303030-3030-4303-8303-303030300304")
TEACHER_KG_STAFF = UUID("30303030-3030-4303-8303-303030300305")

# Users.
ADMIN_USER = UUID("30303030-3030-4303-8303-303030300401")
DEPUTY_JHS_USER = UUID("30303030-3030-4303-8303-303030300402")
TEACHER_JHS_USER = UUID("30303030-3030-4303-8303-303030300403")
PARENT_USER = UUID("30303030-3030-4303-8303-303030300404")

# Amaru-named students.
STUDENT_JHS1_A = UUID("30303030-3030-4303-8303-303030300501")
STUDENT_JHS1_B = UUID("30303030-3030-4303-8303-303030300502")
STUDENT_JHS2 = UUID("30303030-3030-4303-8303-303030300503")
STUDENT_KG = UUID("30303030-3030-4303-8303-303030300504")
STUDENT_CHILD = UUID("30303030-3030-4303-8303-303030300505")

# Guardian for the Parent scope test.
GUARDIAN_UUID = UUID("30303030-3030-4303-8303-303030300601")

ACCOUNTANT_USER = UUID("30303030-3030-4303-8303-303030300405")

# Fee item / lesson plan / scheme fixtures for the 3 new search domains.
FEE_ITEM_UUID = UUID("30303030-3030-4303-8303-303030300701")
LESSON_PLAN_JHS_UUID = UUID("30303030-3030-4303-8303-303030300702")
LESSON_PLAN_KG_UUID = UUID("30303030-3030-4303-8303-303030300703")
SCHEME_JHS_UUID = UUID("30303030-3030-4303-8303-303030300704")
SCHEME_KG_UUID = UUID("30303030-3030-4303-8303-303030300705")
SUBJECT_UUID = UUID("30303030-3030-4303-8303-303030300706")

ACADEMIC_YEAR = "2025/2026"


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
    db_session.add(
        School(
            id=SCHOOL_UUID,
            slug="test-school-search",
            name="Test School (search)",
            academic_year=ACADEMIC_YEAR,
            current_term=2,
            grading_scale="GES_STANDARD",
            is_active=True,
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            Class(
                id=CLASS_KG1,
                slug="KG1-25",
                school_id=SCHOOL_UUID,
                name="KG 1",
                division="KG",
                academic_year=ACADEMIC_YEAR,
            ),
            Class(
                id=CLASS_JHS1,
                slug="JHS1-25",
                school_id=SCHOOL_UUID,
                name="JHS 1",
                division="JHS",
                academic_year=ACADEMIC_YEAR,
            ),
            Class(
                id=CLASS_JHS2,
                slug="JHS2-25",
                school_id=SCHOOL_UUID,
                name="JHS 2",
                division="JHS",
                academic_year=ACADEMIC_YEAR,
            ),
            Class(
                id=CLASS_LP3A,
                slug="P3A-25",
                school_id=SCHOOL_UUID,
                name="Primary 3 A",
                division="Lower Primary",
                academic_year=ACADEMIC_YEAR,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Staff(
                id=ADMIN_STAFF,
                slug="STAFF-ADM",
                school_id=SCHOOL_UUID,
                first_name="Adae",
                last_name="Admin",
                system_role="Admin",
                email="admin@sea.test",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_JHS_STAFF,
                slug="STAFF-DH-JHS",
                school_id=SCHOOL_UUID,
                first_name="Yaw",
                last_name="DeputyJhs",
                system_role="DeputyHead",
                division="JHS",
                email="dhjhs@sea.test",
                is_active=True,
            ),
            Staff(
                id=TEACHER_JHS_STAFF,
                slug="STAFF-T-JHS",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Teacher",
                system_role="Teacher",
                division="JHS",
                email="teacher@sea.test",
                is_active=True,
            ),
            # Distinctive-email staff — no name/slug match on "findme"
            # so the email column is the only path in.
            Staff(
                id=EMAIL_ONLY_STAFF,
                slug="STAFF-ZZ",
                school_id=SCHOOL_UUID,
                first_name="Zebra",
                last_name="Zulu",
                system_role="Accountant",
                email="findme@special.test",
                is_active=True,
            ),
            # Owns the KG-division lesson plan/scheme — proves JHS
            # Teacher/DeputyHead scoping excludes them.
            Staff(
                id=TEACHER_KG_STAFF,
                slug="STAFF-T-KG",
                school_id=SCHOOL_UUID,
                first_name="Akosua",
                last_name="TeacherKg",
                system_role="Teacher",
                division="KG",
                email="teacherkg@sea.test",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add(
        Subject(
            id=SUBJECT_UUID, slug="MATH", school_id=SCHOOL_UUID, name="Mathematics", category="Core"
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            FeeItem(
                id=FEE_ITEM_UUID,
                school_id=SCHOOL_UUID,
                name="Amaru PTA Dues",
                scope="school",
                academic_year=ACADEMIC_YEAR,
                amount_minor=5000,
                is_active=True,
            ),
            LessonPlan(
                id=LESSON_PLAN_JHS_UUID,
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_JHS_STAFF,
                subject_id=SUBJECT_UUID,
                class_id=CLASS_JHS1,
                term=2,
                week=1,
                topic="Amaru Fractions",
                status="draft",
            ),
            LessonPlan(
                id=LESSON_PLAN_KG_UUID,
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_KG_STAFF,
                subject_id=SUBJECT_UUID,
                class_id=CLASS_KG1,
                term=2,
                week=1,
                topic="Amaru Shapes",
                status="draft",
            ),
            Scheme(
                id=SCHEME_JHS_UUID,
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_JHS_STAFF,
                subject_id=SUBJECT_UUID,
                class_id=CLASS_JHS1,
                type="work",
                term=2,
                academic_year=ACADEMIC_YEAR,
                title="Amaru Term Scheme",
                status="draft",
            ),
            Scheme(
                id=SCHEME_KG_UUID,
                school_id=SCHOOL_UUID,
                teacher_id=TEACHER_KG_STAFF,
                subject_id=SUBJECT_UUID,
                class_id=CLASS_KG1,
                type="work",
                term=2,
                academic_year=ACADEMIC_YEAR,
                title="Amaru KG Scheme",
                status="draft",
            ),
        ]
    )
    await db_session.flush()

    # The teacher's class assignment — sole trigger for
    # `teacher_class_ids` to return JHS 1.
    db_session.add(ClassTeacher(class_id=CLASS_JHS1, staff_id=TEACHER_JHS_STAFF, is_primary=True))
    await db_session.flush()

    db_session.add(
        Guardian(
            id=GUARDIAN_UUID,
            slug="GUAR-PARENT",
            school_id=SCHOOL_UUID,
            first_name="Paa",
            last_name="Parent",
            email="parent@sea.test",
        )
    )
    await db_session.flush()

    db_session.add_all(
        [
            User(
                id=ADMIN_USER,
                school_id=SCHOOL_UUID,
                email="admin@sea.test",
                role="Admin",
                linked_id=ADMIN_STAFF,
                is_active=True,
            ),
            User(
                id=DEPUTY_JHS_USER,
                school_id=SCHOOL_UUID,
                email="dhjhs@sea.test",
                role="DeputyHead",
                linked_id=DEPUTY_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=TEACHER_JHS_USER,
                school_id=SCHOOL_UUID,
                email="teacher@sea.test",
                role="Teacher",
                linked_id=TEACHER_JHS_STAFF,
                is_active=True,
            ),
            User(
                id=ACCOUNTANT_USER,
                school_id=SCHOOL_UUID,
                email="findme@special.test",
                role="Accountant",
                linked_id=EMAIL_ONLY_STAFF,
                is_active=True,
            ),
            User(
                id=PARENT_USER,
                school_id=SCHOOL_UUID,
                email="parent@sea.test",
                role="Parent",
                linked_id=GUARDIAN_UUID,
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Student(
                id=STUDENT_JHS1_A,
                slug="STU-AMA-JHS1A",
                school_id=SCHOOL_UUID,
                first_name="Amaru",
                last_name="Alpha",
                gender="Male",
                is_active=True,
            ),
            Student(
                id=STUDENT_JHS1_B,
                slug="STU-AMA-JHS1B",
                school_id=SCHOOL_UUID,
                first_name="Amaru",
                last_name="Beta",
                gender="Female",
                is_active=True,
            ),
            Student(
                id=STUDENT_JHS2,
                slug="STU-AMA-JHS2",
                school_id=SCHOOL_UUID,
                first_name="Amaru",
                last_name="Gamma",
                gender="Male",
                is_active=True,
            ),
            Student(
                id=STUDENT_KG,
                slug="STU-AMA-KG",
                school_id=SCHOOL_UUID,
                first_name="Amaru",
                last_name="Delta",
                gender="Female",
                is_active=True,
            ),
            Student(
                id=STUDENT_CHILD,
                slug="STU-AMA-CHILD",
                school_id=SCHOOL_UUID,
                first_name="Amaru",
                last_name="Child",
                gender="Male",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()

    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT_JHS1_A,
                class_id=CLASS_JHS1,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_JHS1_B,
                class_id=CLASS_JHS1,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_JHS2,
                class_id=CLASS_JHS2,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_KG,
                class_id=CLASS_KG1,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
            Enrollment(
                student_id=STUDENT_CHILD,
                class_id=CLASS_JHS2,
                academic_year=ACADEMIC_YEAR,
                status="Active",
                enrollment_date=date(2025, 9, 1),
            ),
        ]
    )
    await db_session.flush()

    db_session.add(
        StudentGuardian(
            student_id=STUDENT_CHILD,
            guardian_id=GUARDIAN_UUID,
            relation="father",
            is_primary=True,
        )
    )
    await db_session.flush()

    # 10 additional students purely for the per-domain cap test. They
    # share the "Capacity" prefix so they don't collide with any
    # `amaru`/`findme` query in the other tests.
    cap_students = [
        Student(
            id=UUID(f"30303030-3030-4303-8303-3030303008{i:02d}"),
            slug=f"STU-CAP-{i:02d}",
            school_id=SCHOOL_UUID,
            first_name="Capacity",
            last_name=f"Number{i:02d}",
            gender="Male",
            is_active=True,
        )
        for i in range(1, 11)
    ]
    db_session.add_all(cap_students)
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
    email: str = "test@example.com",
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
            "email": email,
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}
