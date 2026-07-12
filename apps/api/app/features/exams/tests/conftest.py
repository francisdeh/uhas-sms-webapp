"""Fixtures for the Exams test suite.

Seeds: school, class (JHS 1, AY 2025/2026), subject (Math), three
students actively enrolled in the class. Distinct UUID range (`cc…`)
to avoid collisions with other suites.
"""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from datetime import date
from typing import Any
from uuid import UUID

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.classes.model import Class, ClassTeacher
from app.features.enrollments.model import Enrollment
from app.features.exams.model import Exam, Score
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.subjects.model import Subject
from app.integrations.storage import Bucket, StorageClient, get_storage_client
from app.main import app

SCHOOL_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0001")
CLASS_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0101")
SUBJECT_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0201")
STUDENT_A_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0301")
STUDENT_B_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0302")
STUDENT_C_UUID = UUID("cccccccc-cccc-4ccc-8ccc-cccccccc0303")
USER_UUID = UUID("00000000-0000-0000-0000-0000000000cc")

# ─── Report-card seed graph (shared by test_report_card.py + test_report_card_pdf.py) ──

GUARDIAN_UUID = UUID("80808080-8080-4808-8808-080808080401")
OTHER_GUARDIAN_UUID = UUID("80808080-8080-4808-8808-080808080402")
CLASS_TEACHER_A_UUID = UUID("80808080-8080-4808-8808-080808080501")
CLASS_TEACHER_B_UUID = UUID("80808080-8080-4808-8808-080808080502")
OTHER_TEACHER_UUID = UUID("80808080-8080-4808-8808-080808080503")
DEPUTY_JHS_UUID = UUID("80808080-8080-4808-8808-080808080504")
DEPUTY_KG_UUID = UUID("80808080-8080-4808-8808-080808080505")
OTHER_CLASS_UUID = UUID("80808080-8080-4808-8808-080808080601")
OTHER_STUDENT_UUID = UUID("80808080-8080-4808-8808-080808080602")


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
        slug="test-school-exams",
        name="Test School (exams)",
        academic_year="2025/2026",
        current_term=2,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_class(db_session: AsyncSession, seed_school: School) -> Class:
    cls = Class(
        id=CLASS_UUID,
        slug="class-jhs1",
        school_id=SCHOOL_UUID,
        name="JHS 1",
        division="JHS",
        academic_year="2025/2026",
    )
    db_session.add(cls)
    await db_session.flush()
    return cls


@pytest_asyncio.fixture
async def seed_subject(db_session: AsyncSession, seed_school: School) -> Subject:
    subj = Subject(
        id=SUBJECT_UUID,
        slug="MATH",
        school_id=SCHOOL_UUID,
        name="Mathematics",
        division="JHS",
        category="Core",
    )
    db_session.add(subj)
    await db_session.flush()
    return subj


@pytest_asyncio.fixture
async def seed_students(
    db_session: AsyncSession, seed_school: School, seed_class: Class
) -> tuple[Student, Student, Student]:
    a = Student(
        id=STUDENT_A_UUID,
        slug="UHAS-2025-0001",
        school_id=SCHOOL_UUID,
        first_name="Ama",
        last_name="Adjei",
        dob=date(2012, 1, 1),
        gender="Female",
        is_active=True,
    )
    b = Student(
        id=STUDENT_B_UUID,
        slug="UHAS-2025-0002",
        school_id=SCHOOL_UUID,
        first_name="Kojo",
        last_name="Boateng",
        dob=date(2012, 2, 2),
        gender="Male",
        is_active=True,
    )
    c = Student(
        id=STUDENT_C_UUID,
        slug="UHAS-2025-0003",
        school_id=SCHOOL_UUID,
        first_name="Yaa",
        last_name="Mensah",
        dob=date(2012, 3, 3),
        gender="Female",
        is_active=True,
    )
    db_session.add_all([a, b, c])
    await db_session.flush()
    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT_A_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_B_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_C_UUID,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
        ]
    )
    await db_session.flush()
    return a, b, c


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
    an unrelated KG class + student for cross-division checks. Shared
    by `test_report_card.py` and `test_report_card_pdf.py`."""
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


class FakeStorageClient:
    """In-memory `StorageClient` double — records uploads, returns a
    deterministic fake signed URL. Real `SUPABASE_SERVICE_ROLE_KEY`
    presence varies across local/CI, so report-card PDF tests inject
    this instead of `get_storage_client()`'s environment-dependent
    resolution."""

    def __init__(self) -> None:
        self.uploads: list[tuple[Bucket, str, bytes, str | None]] = []

    async def upload(
        self,
        bucket: Bucket,
        path: str,
        data: bytes,
        *,
        content_type: str | None = None,
        upsert: bool = False,
    ) -> None:
        self.uploads.append((bucket, path, data, content_type))

    async def download(self, bucket: Bucket, path: str) -> bytes:
        for b, p, data, _ in reversed(self.uploads):
            if b == bucket and p == path:
                return data
        raise FileNotFoundError(f"{bucket}/{path} was never uploaded to this fake.")

    async def get_public_url(self, bucket: Bucket, path: str) -> str:
        return f"https://fake-storage.test/{bucket}/{path}"

    async def get_signed_url(self, bucket: Bucket, path: str, *, ttl_seconds: int = 3600) -> str:
        return f"https://fake-storage.test/{bucket}/{path}?signed=1"


@pytest.fixture
def fake_storage() -> FakeStorageClient:
    return FakeStorageClient()


@pytest_asyncio.fixture
async def client(
    db_session: AsyncSession, fake_storage: FakeStorageClient
) -> AsyncIterator[AsyncClient]:
    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        yield db_session

    def _override_storage() -> StorageClient:
        return fake_storage

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[get_storage_client] = _override_storage
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
    linked_id: UUID | str | None = None,
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
