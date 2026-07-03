"""HTTP-level tests for the class-report workflow.

Covers: list/get with role-scoped visibility, draft upsert (create +
replace), submit + idempotency, HOS comment PATCH with division gating,
audit-log side effect, and 404/401 error paths.
"""

from __future__ import annotations

from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.classes.model import Class, ClassTeacher
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

# Distinct UUID range for this suite — brief pinned `60606060-6060-4606-8606-…`.
OTHER_CLASS_UUID = UUID("60606060-6060-4606-8606-606060600101")
OTHER_DIVISION_CLASS_UUID = UUID("60606060-6060-4606-8606-606060600102")
CLASS_TEACHER_UUID = UUID("60606060-6060-4606-8606-606060600201")
OTHER_TEACHER_UUID = UUID("60606060-6060-4606-8606-606060600202")
DEPUTY_JHS_UUID = UUID("60606060-6060-4606-8606-606060600301")
DEPUTY_KG_UUID = UUID("60606060-6060-4606-8606-606060600302")
ADMIN_STAFF_UUID = UUID("60606060-6060-4606-8606-606060600401")


@pytest_asyncio.fixture
async def seed_class_teacher(
    db_session: AsyncSession,
    seed_school: School,
    seed_class: Class,
) -> Staff:
    """Class teacher for the seed class (JHS 1). Owns the report."""
    _ = (seed_school, seed_class)
    staff = Staff(
        id=CLASS_TEACHER_UUID,
        slug="STAFF-CT-01",
        school_id=SCHOOL_UUID,
        first_name="Owner",
        last_name="Teacher",
        system_role="Teacher",
        division="JHS",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    db_session.add(ClassTeacher(class_id=CLASS_UUID, staff_id=CLASS_TEACHER_UUID, is_primary=True))
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_other_teacher(db_session: AsyncSession, seed_school: School) -> Staff:
    """A teacher who does NOT teach the seed class — 403 target."""
    _ = seed_school
    staff = Staff(
        id=OTHER_TEACHER_UUID,
        slug="STAFF-CT-02",
        school_id=SCHOOL_UUID,
        first_name="Other",
        last_name="Teacher",
        system_role="Teacher",
        division="JHS",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_deputy_jhs(db_session: AsyncSession, seed_school: School) -> Staff:
    _ = seed_school
    staff = Staff(
        id=DEPUTY_JHS_UUID,
        slug="STAFF-DH-JHS",
        school_id=SCHOOL_UUID,
        first_name="Dhead",
        last_name="Jhs",
        system_role="DeputyHead",
        division="JHS",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_deputy_kg(db_session: AsyncSession, seed_school: School) -> Staff:
    _ = seed_school
    staff = Staff(
        id=DEPUTY_KG_UUID,
        slug="STAFF-DH-KG",
        school_id=SCHOOL_UUID,
        first_name="Dhead",
        last_name="Kg",
        system_role="DeputyHead",
        division="KG",
        is_active=True,
    )
    db_session.add(staff)
    await db_session.flush()
    return staff


@pytest_asyncio.fixture
async def seed_other_division_class(db_session: AsyncSession, seed_school: School) -> Class:
    """A KG class in a different division — the JHS deputy shouldn't see it."""
    _ = seed_school
    cls = Class(
        id=OTHER_DIVISION_CLASS_UUID,
        slug="class-kg1",
        school_id=SCHOOL_UUID,
        name="KG 1",
        division="KG",
        academic_year="2025/2026",
    )
    db_session.add(cls)
    await db_session.flush()
    return cls


async def _make_exam(client: AsyncClient) -> str:
    res = await client.post(
        "/exams",
        json={
            "name": "Term 2 End of Term",
            "type": "EndOfTerm",
            "term": 2,
            "academicYear": "2025/2026",
        },
        headers=auth_header(role="Admin"),
    )
    return str(res.json()["id"])


# ─── Auth / role scoping ─────────────────────────────────────────────────────


async def test_list_requires_auth(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    exam_id = await _make_exam(client)
    res = await client.get(f"/exams/{exam_id}/class-reports")
    assert res.status_code == 401


async def test_list_by_admin_returns_all_classes(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_other_division_class: Class,
) -> None:
    _ = (seed_school, seed_class, seed_other_division_class)
    exam_id = await _make_exam(client)
    res = await client.get(f"/exams/{exam_id}/class-reports", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    class_ids = {i["classId"] for i in items}
    assert str(CLASS_UUID) in class_ids
    assert str(OTHER_DIVISION_CLASS_UUID) in class_ids


async def test_list_by_deputy_scopes_to_own_division(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_other_division_class: Class,
    seed_deputy_jhs: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_other_division_class, seed_deputy_jhs)
    exam_id = await _make_exam(client)
    res = await client.get(
        f"/exams/{exam_id}/class-reports",
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_JHS_UUID),
    )
    assert res.status_code == 200
    class_ids = {i["classId"] for i in res.json()["items"]}
    assert str(CLASS_UUID) in class_ids
    assert str(OTHER_DIVISION_CLASS_UUID) not in class_ids


async def test_list_by_class_teacher_scopes_to_own_classes(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_other_division_class: Class,
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_other_division_class, seed_class_teacher)
    exam_id = await _make_exam(client)
    res = await client.get(
        f"/exams/{exam_id}/class-reports",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 200
    class_ids = {i["classId"] for i in res.json()["items"]}
    assert class_ids == {str(CLASS_UUID)}


async def test_list_by_parent_forbidden(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    exam_id = await _make_exam(client)
    res = await client.get(f"/exams/{exam_id}/class-reports", headers=auth_header(role="Parent"))
    assert res.status_code == 403


# ─── Detail (GET) ────────────────────────────────────────────────────────────


async def test_get_detail_returns_full_roster(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    res = await client.get(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft"
    assert body["hosComment"] is None
    assert len(body["remarks"]) == 3
    student_ids = {r["studentId"] for r in body["remarks"]}
    assert student_ids == {str(STUDENT_A_UUID), str(STUDENT_B_UUID), str(STUDENT_C_UUID)}


async def test_get_detail_by_non_owner_teacher_forbidden(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_other_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_other_teacher)
    exam_id = await _make_exam(client)
    res = await client.get(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}",
        headers=auth_header(role="Teacher", linked_id=OTHER_TEACHER_UUID),
    )
    assert res.status_code == 403


async def test_get_detail_missing_exam_is_404(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    res = await client.get(
        f"/exams/{OTHER_CLASS_UUID}/class-reports/{CLASS_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404


async def test_get_detail_missing_class_is_404(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    exam_id = await _make_exam(client)
    res = await client.get(
        f"/exams/{exam_id}/class-reports/{OTHER_CLASS_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404


# ─── Draft PUT ───────────────────────────────────────────────────────────────


async def test_draft_upsert_creates_report_and_remarks(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    payload = {
        "hosComment": "Overall solid term.",
        "remarks": [
            {"studentId": str(STUDENT_A_UUID), "text": "Excellent."},
            {"studentId": str(STUDENT_B_UUID), "text": "Steady progress."},
        ],
    }
    res = await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json=payload,
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft"
    assert body["hosComment"] == "Overall solid term."
    remarks_by_student = {r["studentId"]: r for r in body["remarks"]}
    assert remarks_by_student[str(STUDENT_A_UUID)]["text"] == "Excellent."
    assert remarks_by_student[str(STUDENT_B_UUID)]["text"] == "Steady progress."
    # Untouched roster row still comes back with no remark.
    assert remarks_by_student[str(STUDENT_C_UUID)]["text"] is None


async def test_draft_upsert_replaces_remarks_atomically(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={
            "hosComment": "first",
            "remarks": [{"studentId": str(STUDENT_A_UUID), "text": "v1"}],
        },
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={
            "hosComment": "second",
            "remarks": [{"studentId": str(STUDENT_B_UUID), "text": "v2"}],
        },
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["hosComment"] == "second"
    remarks_by_student = {r["studentId"]: r for r in body["remarks"]}
    assert remarks_by_student[str(STUDENT_A_UUID)]["text"] is None
    assert remarks_by_student[str(STUDENT_B_UUID)]["text"] == "v2"


async def test_draft_upsert_shows_up_in_list(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": "hi", "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.get(f"/exams/{exam_id}/class-reports", headers=auth_header(role="Admin"))
    items_by_class = {i["classId"]: i for i in res.json()["items"]}
    row = items_by_class[str(CLASS_UUID)]
    assert row["hosComment"] == "hi"
    assert row["status"] == "draft"


async def test_draft_forbidden_for_non_owner_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_other_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_other_teacher)
    exam_id = await _make_exam(client)
    res = await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=OTHER_TEACHER_UUID),
    )
    assert res.status_code == 403


# ─── Submit ──────────────────────────────────────────────────────────────────


async def test_submit_transitions_and_stamps(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "submitted"
    assert body["submittedById"] == str(CLASS_TEACHER_UUID)
    assert body["submittedAt"] is not None


async def test_submit_is_idempotent(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    first = await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    second = await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "submitted"
    assert second.json()["status"] == "submitted"
    # Same DB row → same submittedAt.
    assert first.json()["submittedAt"] == second.json()["submittedAt"]


async def test_draft_rejected_after_submitted(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": "trying again", "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 403


# ─── HOS comment PATCH ───────────────────────────────────────────────────────


async def test_hos_comment_by_deputy_own_division(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
    seed_deputy_jhs: Staff,
    db_session: AsyncSession,
) -> None:
    _ = (
        seed_school,
        seed_class,
        seed_students,
        seed_class_teacher,
        seed_deputy_jhs,
    )
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": "original", "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.patch(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/hos-comment",
        json={"hosComment": "amended by DH"},
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_JHS_UUID),
    )
    assert res.status_code == 200
    assert res.json()["hosComment"] == "amended by DH"

    audit_rows = (
        (
            await db_session.execute(
                select(AuditLog).where(AuditLog.action == "CLASS_REPORT_HOS_COMMENT_UPDATED")
            )
        )
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    assert audit_rows[0].before == {"hosComment": "original"}
    assert audit_rows[0].after == {"hosComment": "amended by DH"}


async def test_hos_comment_by_deputy_other_division_forbidden(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
    seed_deputy_kg: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher, seed_deputy_kg)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": "original", "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.patch(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/hos-comment",
        json={"hosComment": "should be rejected"},
        headers=auth_header(role="DeputyHead", linked_id=DEPUTY_KG_UUID),
    )
    assert res.status_code == 403


async def test_hos_comment_by_admin_succeeds(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.patch(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/hos-comment",
        json={"hosComment": "admin remark"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["hosComment"] == "admin remark"


async def test_hos_comment_by_class_teacher_forbidden(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_students: tuple[Student, Student, Student],
    seed_class_teacher: Staff,
) -> None:
    _ = (seed_school, seed_class, seed_students, seed_class_teacher)
    exam_id = await _make_exam(client)
    await client.put(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/draft",
        json={"hosComment": None, "remarks": []},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    await client.post(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/submit",
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    res = await client.patch(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/hos-comment",
        json={"hosComment": "teacher trying"},
        headers=auth_header(role="Teacher", linked_id=CLASS_TEACHER_UUID),
    )
    assert res.status_code == 403


async def test_hos_comment_on_missing_report_is_404(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
) -> None:
    _ = (seed_school, seed_class)
    exam_id = await _make_exam(client)
    res = await client.patch(
        f"/exams/{exam_id}/class-reports/{CLASS_UUID}/hos-comment",
        json={"hosComment": "no report yet"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 404
