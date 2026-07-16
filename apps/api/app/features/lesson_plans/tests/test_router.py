"""HTTP-level tests for /lesson-plans — state machine + reviewer auth."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.classes.model import Class
from app.features.lesson_plans.tests.conftest import (
    ADMIN_UUID,
    CLASS_UUID,
    DEPUTY_OTHER_UUID,
    DEPUTY_UUID,
    SUBJECT_UUID,
    TEACHER_UUID,
    UNIT_HEAD_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject


def _create_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subjectId": str(SUBJECT_UUID),
        "classId": str(CLASS_UUID),
        "term": 2,
        "week": 1,
        "topic": "Fractions",
        "learningObjectives": "Add and subtract fractions.",
    }
    body.update(overrides)
    return body


async def _create_plan(client: AsyncClient) -> str:
    res = await client.post(
        "/lesson-plans", json=_create_body(), headers=auth_header(role="Teacher")
    )
    assert res.status_code == 201
    return str(res.json()["id"])


# ─── Create + read ───────────────────────────────────────────────────────────


async def test_create_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/lesson-plans", json=_create_body())
    assert res.status_code == 401


async def test_create_starts_as_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    res = await client.post(
        "/lesson-plans", json=_create_body(), headers=auth_header(role="Teacher")
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "draft"
    assert body["teacherId"] == str(TEACHER_UUID)
    assert body["subjectName"] == "Mathematics"
    assert body["className"] == "JHS 1"
    assert body["division"] == "JHS"


async def test_get_403_when_neither_owner_nor_approver(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    # Another Teacher (Unit Head) tries to peek — should 403 unless approver.
    res = await client.get(
        f"/lesson-plans/{plan_id}",
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 403


async def test_get_ok_when_owner(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    res = await client.get(f"/lesson-plans/{plan_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 200


async def test_list_defaults_to_own_for_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    await _create_plan(client)
    # Teacher list: sees own.
    own = await client.get("/lesson-plans", headers=auth_header(role="Teacher"))
    assert own.json()["total"] == 1
    # Different Teacher (unit head) sees none of their own.
    other = await client.get(
        "/lesson-plans",
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert other.json()["total"] == 0


async def test_list_deputy_sees_everyone(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    await _create_plan(client)
    res = await client.get(
        "/lesson-plans",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_UUID)),
    )
    assert res.json()["total"] == 1


# ─── Update ──────────────────────────────────────────────────────────────────


async def test_teacher_can_edit_own_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    res = await client.patch(
        f"/lesson-plans/{plan_id}",
        json={"topic": "Improper fractions"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["topic"] == "Improper fractions"


async def test_edit_forbidden_for_other_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    res = await client.patch(
        f"/lesson-plans/{plan_id}",
        json={"topic": "…"},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 403


async def test_edit_rejected_plan_moves_back_to_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    # Teacher submits.
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    # Unit Head rejects.
    await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "rejected", "comment": "Add resources."},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    # Teacher edits the plan.
    res = await client.patch(
        f"/lesson-plans/{plan_id}",
        json={"resources": "Textbook chapter 4."},
        headers=auth_header(role="Teacher"),
    )
    body = res.json()
    assert body["status"] == "draft"
    # The rejection review row survives — the response mirrors the LATEST
    # review from the child table. UI hides the badge while status=draft,
    # so this preserved history isn't visible to the teacher on the plan
    # form; it just powers the future "review history" panel.
    assert body["reviewerComment"] == "Add resources."
    assert body["reviewedById"] == str(UNIT_HEAD_UUID)


# ─── Submit ──────────────────────────────────────────────────────────────────


async def test_submit_advances_draft_to_submitted(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    res = await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    assert res.json()["status"] == "submitted"


async def test_double_submit_conflicts(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 409


# ─── Review authorisation ───────────────────────────────────────────────────


async def test_unit_head_can_advance_to_unit_head_approved(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "unit_head_approved", "comment": "Looks great."},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "unit_head_approved"
    assert res.json()["reviewedById"] == str(UNIT_HEAD_UUID)


async def test_review_writes_audit_log(
    client: AsyncClient,
    db_session: AsyncSession,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "unit_head_approved", "comment": "Looks great."},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )

    rows = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    and_(
                        AuditLog.action == "LESSON_PLAN_REVIEWED",
                        AuditLog.target_id == plan_id,
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert rows[0].before == {"status": "submitted"}
    assert rows[0].after == {"status": "unit_head_approved", "comment": "Looks great."}


async def test_non_unit_head_teacher_cannot_advance(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    # Owner Teacher (not Unit Head) tries to approve themselves.
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "unit_head_approved"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 403


async def test_deputy_head_can_finalise(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "unit_head_approved"},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"


async def test_deputy_of_wrong_division_cannot_finalise(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "unit_head_approved"},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    # KG Deputy tries to approve a JHS plan.
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "approved"},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_OTHER_UUID)),
    )
    assert res.status_code == 403


async def test_admin_can_do_any_step(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    # Admin skips Unit Head and approves directly.
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "approved"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "approved"


async def test_terminal_states_reject_review(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "approved"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    # Any further review attempt on `approved` should 400.
    res = await client.post(
        f"/lesson-plans/{plan_id}/review",
        json={"decision": "rejected"},
        headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID)),
    )
    assert res.status_code == 400


# ─── Soft delete ─────────────────────────────────────────────────────────────


async def test_teacher_can_soft_delete_own_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    res = await client.delete(f"/lesson-plans/{plan_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 204
    # Deleted plans disappear from list.
    listed = await client.get("/lesson-plans", headers=auth_header(role="Teacher"))
    assert listed.json()["total"] == 0
    # And return 404 on direct fetch.
    detail = await client.get(f"/lesson-plans/{plan_id}", headers=auth_header(role="Teacher"))
    assert detail.status_code == 404


async def test_cannot_delete_submitted_plan(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    plan_id = await _create_plan(client)
    await client.post(f"/lesson-plans/{plan_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.delete(f"/lesson-plans/{plan_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 409
