"""Integration tests for staff profile depth (Phase 6 item 4): hire
date, subject expertise, qualifications, documents."""

from __future__ import annotations

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import engine, get_session
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject
from app.main import app

SCHOOL_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0001")

ADMIN_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0101")
TEACHER_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0102")
OTHER_TEACHER_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0103")

MATH_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0201")
SCIENCE_UUID = UUID("5ca1ab1e-5ca1-45ca-85ca-5ca1ab1e0202")

ADMIN_USER = UUID("00000000-0000-0000-0000-00000000ac01")
TEACHER_USER = UUID("00000000-0000-0000-0000-00000000ac02")
OTHER_TEACHER_USER = UUID("00000000-0000-0000-0000-00000000ac03")


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with engine.connect() as conn:
        trans = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False)
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


@pytest_asyncio.fixture
async def seed_school(db_session: AsyncSession) -> School:
    school = School(
        id=SCHOOL_UUID,
        slug="test-school-staff-depth",
        name="Test School (staff depth)",
        academic_year="2025/2026",
        current_term=1,
        grading_scale="GES_STANDARD",
        is_active=True,
    )
    db_session.add(school)
    await db_session.flush()
    return school


@pytest_asyncio.fixture
async def seed_staff(db_session: AsyncSession, seed_school: School) -> dict[str, Staff]:
    admin = Staff(
        id=ADMIN_UUID,
        slug="STAFF-DEPTH-001",
        school_id=SCHOOL_UUID,
        first_name="Kwesi",
        last_name="Admin",
        system_role="Admin",
        email="kwesi-depth@uhas.edu.gh",
        is_active=True,
    )
    teacher = Staff(
        id=TEACHER_UUID,
        slug="STAFF-DEPTH-002",
        school_id=SCHOOL_UUID,
        first_name="Adjoa",
        last_name="Teach",
        system_role="Teacher",
        division="JHS",
        email="adjoa-depth@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    other_teacher = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-DEPTH-003",
        school_id=SCHOOL_UUID,
        first_name="Kofi",
        last_name="Other",
        system_role="Teacher",
        division="JHS",
        email="kofi-depth@uhas.edu.gh",
        rank="Teacher",
        is_active=True,
    )
    db_session.add_all([admin, teacher, other_teacher])
    await db_session.flush()
    return {"admin": admin, "teacher": teacher, "other_teacher": other_teacher}


@pytest_asyncio.fixture
async def seed_subjects(db_session: AsyncSession, seed_school: School) -> dict[str, Subject]:
    math = Subject(
        id=MATH_UUID, slug="MATH", school_id=SCHOOL_UUID, name="Mathematics", category="Core"
    )
    science = Subject(
        id=SCIENCE_UUID, slug="SCI", school_id=SCHOOL_UUID, name="Science", category="Core"
    )
    db_session.add_all([math, science])
    await db_session.flush()
    return {"math": math, "science": science}


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
    user_id: UUID | str = ADMIN_USER,
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


pytestmark = pytest.mark.usefixtures("seed_school", "seed_staff", "seed_subjects")


async def test_hire_date_round_trips(client: AsyncClient) -> None:
    resp = await client.patch(
        f"/staff/{TEACHER_UUID}", json={"hireDate": "2022-09-01"}, headers=auth_header()
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["hireDate"] == "2022-09-01"

    get_resp = await client.get(f"/staff/{TEACHER_UUID}", headers=auth_header())
    assert get_resp.json()["hireDate"] == "2022-09-01"


async def test_non_admin_cannot_edit_hire_date(client: AsyncClient) -> None:
    resp = await client.patch(
        f"/staff/{TEACHER_UUID}",
        json={"hireDate": "2022-09-01"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert resp.status_code == 403


async def test_replace_subject_expertise(client: AsyncClient) -> None:
    resp = await client.put(
        f"/staff/{TEACHER_UUID}/subjects",
        json={"subjectIds": [str(MATH_UUID), str(SCIENCE_UUID)]},
        headers=auth_header(),
    )
    assert resp.status_code == 200, resp.text
    names = {s["name"] for s in resp.json()}
    assert names == {"Mathematics", "Science"}

    # Replacing again with a subset drops the other.
    resp2 = await client.put(
        f"/staff/{TEACHER_UUID}/subjects",
        json={"subjectIds": [str(MATH_UUID)]},
        headers=auth_header(),
    )
    assert resp2.status_code == 200
    assert [s["name"] for s in resp2.json()] == ["Mathematics"]


async def test_subject_expertise_read_is_open(client: AsyncClient) -> None:
    await client.put(
        f"/staff/{TEACHER_UUID}/subjects",
        json={"subjectIds": [str(MATH_UUID)]},
        headers=auth_header(),
    )
    resp = await client.get(
        f"/staff/{TEACHER_UUID}/subjects",
        headers=auth_header(
            role="Teacher", user_id=OTHER_TEACHER_USER, linked_id=OTHER_TEACHER_UUID
        ),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_non_admin_cannot_replace_subject_expertise(client: AsyncClient) -> None:
    resp = await client.put(
        f"/staff/{TEACHER_UUID}/subjects",
        json={"subjectIds": [str(MATH_UUID)]},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert resp.status_code == 403


async def test_replace_subject_expertise_rejects_unknown_subject(client: AsyncClient) -> None:
    resp = await client.put(
        f"/staff/{TEACHER_UUID}/subjects",
        json={"subjectIds": ["00000000-0000-4000-8000-000000000000"]},
        headers=auth_header(),
    )
    assert resp.status_code == 400


async def test_add_and_remove_qualification(client: AsyncClient) -> None:
    add = await client.post(
        f"/staff/{TEACHER_UUID}/qualifications",
        json={"name": "B.Ed Mathematics", "institution": "UCC", "yearObtained": 2018},
        headers=auth_header(),
    )
    assert add.status_code == 201, add.text
    assert len(add.json()) == 1
    qualification_id = add.json()[0]["id"]

    remove = await client.delete(
        f"/staff/{TEACHER_UUID}/qualifications/{qualification_id}", headers=auth_header()
    )
    assert remove.status_code == 200
    assert remove.json() == []


async def test_non_admin_cannot_add_qualification(client: AsyncClient) -> None:
    resp = await client.post(
        f"/staff/{TEACHER_UUID}/qualifications",
        json={"name": "B.Ed Mathematics"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert resp.status_code == 403


async def test_admin_can_upload_and_list_document(client: AsyncClient) -> None:
    resp = await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Certificate", "storagePath": "staff/documents/x/cert.pdf"},
        headers=auth_header(),
    )
    assert resp.status_code == 201, resp.text
    assert len(resp.json()) == 1
    assert resp.json()[0]["label"] == "Certificate"
    assert resp.json()[0]["uploadedByName"] == "Kwesi Admin"


async def test_staff_can_view_own_documents(client: AsyncClient) -> None:
    await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Certificate", "storagePath": "staff/documents/x/cert.pdf"},
        headers=auth_header(),
    )
    resp = await client.get(
        f"/staff/{TEACHER_UUID}/documents",
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1


async def test_staff_cannot_view_others_documents(client: AsyncClient) -> None:
    await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Certificate", "storagePath": "staff/documents/x/cert.pdf"},
        headers=auth_header(),
    )
    resp = await client.get(
        f"/staff/{TEACHER_UUID}/documents",
        headers=auth_header(
            role="Teacher", user_id=OTHER_TEACHER_USER, linked_id=OTHER_TEACHER_UUID
        ),
    )
    assert resp.status_code == 403


async def test_staff_cannot_upload_document(client: AsyncClient) -> None:
    resp = await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Certificate", "storagePath": "staff/documents/x/cert.pdf"},
        headers=auth_header(role="Teacher", user_id=TEACHER_USER, linked_id=TEACHER_UUID),
    )
    assert resp.status_code == 403


async def test_document_other_label_validation(client: AsyncClient) -> None:
    missing_other = await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Other", "storagePath": "staff/documents/x/thing.pdf"},
        headers=auth_header(),
    )
    assert missing_other.status_code == 422

    stray_other = await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={
            "label": "Certificate",
            "otherLabel": "Not allowed",
            "storagePath": "staff/documents/x/thing.pdf",
        },
        headers=auth_header(),
    )
    assert stray_other.status_code == 422


async def test_remove_document(client: AsyncClient) -> None:
    add = await client.post(
        f"/staff/{TEACHER_UUID}/documents",
        json={"label": "Contract", "storagePath": "staff/documents/x/contract.pdf"},
        headers=auth_header(),
    )
    document_id = add.json()[0]["id"]

    remove = await client.delete(
        f"/staff/{TEACHER_UUID}/documents/{document_id}", headers=auth_header()
    )
    assert remove.status_code == 200
    assert remove.json() == []
