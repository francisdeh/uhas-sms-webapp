"""HTTP-level tests for /exams and /exams/{id}/scores."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.classes.model import Class
from app.features.exams.tests.conftest import (
    CLASS_UUID,
    STUDENT_A_UUID,
    STUDENT_B_UUID,
    STUDENT_C_UUID,
    SUBJECT_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.students.model import Student
from app.features.subjects.model import Subject


def _exam_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "name": "Term 2 Mid-Term",
        "type": "EndOfTerm",
        "term": 2,
        "academicYear": "2025/2026",
    }
    base.update(overrides)
    return base


def _scores_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "classId": str(CLASS_UUID),
        "subjectId": str(SUBJECT_UUID),
        "records": [
            {
                "studentId": str(STUDENT_A_UUID),
                "cat1": 10,
                "cat2": 10,
                "projectWork": 10,
                "groupWork": 10,
                "examScore": 90,
            },
            {
                "studentId": str(STUDENT_B_UUID),
                "cat1": 8,
                "cat2": 8,
                "projectWork": 8,
                "groupWork": 8,
                "examScore": 80,
            },
            {
                "studentId": str(STUDENT_C_UUID),
                "cat1": 6,
                "cat2": 6,
                "projectWork": 6,
                "groupWork": 6,
                "examScore": 60,
            },
        ],
    }
    base.update(overrides)
    return base


# ─── Exam CRUD ───────────────────────────────────────────────────────────────


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/exams")
    assert res.status_code == 401


async def test_create_requires_admin(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    for role in ("Teacher", "Parent", "DeputyHead", "Accountant"):
        res = await client.post("/exams", json=_exam_payload(), headers=auth_header(role=role))
        assert res.status_code == 403, role


async def test_create_and_get(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    res = await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Term 2 Mid-Term"
    assert body["type"] == "EndOfTerm"
    assert body["term"] == 2
    assert body["academicYear"] == "2025/2026"
    assert body["isPublished"] is False

    detail = await client.get(f"/exams/{body['id']}", headers=auth_header(role="Admin"))
    assert detail.status_code == 200
    assert detail.json()["id"] == body["id"]


async def test_create_409_on_duplicate_natural_key(
    client: AsyncClient, seed_school: School
) -> None:
    _ = seed_school
    await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    res = await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    assert res.status_code == 409


async def test_update_rejects_when_published(client: AsyncClient, seed_school: School) -> None:
    _ = seed_school
    created = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    await client.post(f"/exams/{created['id']}/publish", headers=auth_header(role="Admin"))
    res = await client.patch(
        f"/exams/{created['id']}",
        json={"name": "New Name"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_publish_and_unpublish_write_audit(
    client: AsyncClient, seed_school: School, db_session: AsyncSession
) -> None:
    _ = seed_school
    created = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    await client.post(f"/exams/{created['id']}/publish", headers=auth_header(role="Admin"))
    await client.post(f"/exams/{created['id']}/unpublish", headers=auth_header(role="Admin"))

    actions = (
        (
            await db_session.execute(
                select(AuditLog.action).where(AuditLog.target_id == created["id"])
            )
        )
        .scalars()
        .all()
    )
    assert set(actions) == {"EXAM_PUBLISH", "EXAM_UNPUBLISH"}


# ─── Scores grid ─────────────────────────────────────────────────────────────


async def test_grid_returns_row_per_student_even_without_scores(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    res = await client.get(
        f"/exams/{exam['id']}/scores?classId={CLASS_UUID}&subjectId={SUBJECT_UUID}",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 3
    assert all(item["totalScore"] is None for item in items)


async def test_upsert_computes_totals_grades_and_positions(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    res = await client.put(
        f"/exams/{exam['id']}/scores",
        json=_scores_payload(),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    items_by_student = {i["studentId"]: i for i in res.json()["items"]}
    # Default weights 10/10/10/10/60 → Ama 10+10+10+10+90*60/100 = 4+54 = wait let me
    # recompute: (10*10 + 10*10 + 10*10 + 10*10 + 90*60) / 100 = (100+100+100+100+5400)/100 = 58.
    ama = items_by_student[str(STUDENT_A_UUID)]
    assert ama["totalScore"] == 58
    assert ama["subjectPosition"] == 1
    kojo = items_by_student[str(STUDENT_B_UUID)]
    assert kojo["totalScore"] == 51  # (80+80+80+80+4800)/100 = 51.2 rounds to 51
    assert kojo["subjectPosition"] == 2
    yaa = items_by_student[str(STUDENT_C_UUID)]
    assert yaa["totalScore"] == 38  # (60+60+60+60+3600)/100 = 38.4 rounds to 38
    assert yaa["subjectPosition"] == 3


async def test_upsert_rejects_student_not_in_class(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    bad = _scores_payload()
    bad["records"].append({"studentId": "11111111-1111-4111-8111-111111111111", "examScore": 50})
    res = await client.put(
        f"/exams/{exam['id']}/scores", json=bad, headers=auth_header(role="Teacher")
    )
    assert res.status_code == 400


async def test_upsert_422_on_duplicate_student_ids(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    bad = _scores_payload()
    bad["records"].append(bad["records"][0].copy())  # dup Ama
    res = await client.put(
        f"/exams/{exam['id']}/scores", json=bad, headers=auth_header(role="Teacher")
    )
    assert res.status_code == 422


async def test_score_edit_after_publish_writes_score_override_audit(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
    db_session: AsyncSession,
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    # Save first, publish, then edit — the second save should audit.
    await client.put(
        f"/exams/{exam['id']}/scores",
        json=_scores_payload(),
        headers=auth_header(role="Teacher"),
    )
    await client.post(f"/exams/{exam['id']}/publish", headers=auth_header(role="Admin"))

    # Edit Ama's exam score down from 90 to 70.
    edited = _scores_payload()
    edited["records"][0]["examScore"] = 70
    await client.put(
        f"/exams/{exam['id']}/scores", json=edited, headers=auth_header(role="Teacher")
    )

    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "SCORE_OVERRIDE")))
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    before = audit_rows[0].before
    after = audit_rows[0].after
    assert before is not None and after is not None
    assert str(STUDENT_A_UUID) in before["records"]
    assert before["records"][str(STUDENT_A_UUID)]["examScore"] == 90
    assert after["records"][str(STUDENT_A_UUID)]["examScore"] == 70


async def test_score_edit_before_publish_does_not_audit(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
    db_session: AsyncSession,
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    exam = (
        await client.post("/exams", json=_exam_payload(), headers=auth_header(role="Admin"))
    ).json()
    await client.put(
        f"/exams/{exam['id']}/scores",
        json=_scores_payload(),
        headers=auth_header(role="Teacher"),
    )
    # Edit before publish — draft edits are silent.
    edited = _scores_payload()
    edited["records"][0]["examScore"] = 40
    await client.put(
        f"/exams/{exam['id']}/scores", json=edited, headers=auth_header(role="Teacher")
    )
    audit_rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "SCORE_OVERRIDE")))
        .scalars()
        .all()
    )
    assert audit_rows == []


async def test_midterm_uses_raw_exam_score(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_students: tuple[Student, Student, Student],
) -> None:
    _ = (seed_class, seed_subject, seed_students)
    midterm = (
        await client.post(
            "/exams",
            json=_exam_payload(name="Term 2 Mid-Term", type="MidTerm"),
            headers=auth_header(role="Admin"),
        )
    ).json()
    res = await client.put(
        f"/exams/{midterm['id']}/scores",
        json=_scores_payload(),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    items_by_student = {i["studentId"]: i for i in res.json()["items"]}
    # MidTerm = raw exam score, ignoring cats/project/group.
    assert items_by_student[str(STUDENT_A_UUID)]["totalScore"] == 90
    assert items_by_student[str(STUDENT_B_UUID)]["totalScore"] == 80
    assert items_by_student[str(STUDENT_C_UUID)]["totalScore"] == 60
