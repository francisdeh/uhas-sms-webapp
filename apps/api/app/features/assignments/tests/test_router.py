"""Router tests for the Assignments API.

Coverage groups:
  1. Create + list (teacher, Admin, Deputy, other-teacher scoping)
  2. Ownership guards on edit / publish / unpublish / delete
  3. Publish state transitions (draft ↔ published)
  4. Soft delete
  5. Parent read: `forStudentIds` ownership verification + published-only
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient

from app.features.assignments.tests.conftest import (
    ADMIN_UUID,
    CLASS_OTHER_UUID,
    CLASS_UUID,
    DEPUTY_UUID,
    GUARDIAN_UUID,
    OTHER_GUARDIAN_UUID,
    OTHER_TEACHER_UUID,
    STUDENT_OTHER_UUID,
    STUDENT_UUID,
    SUBJECT_UUID,
    TEACHER_UUID,
    auth_header,
)
from app.features.classes.model import Class
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student
from app.features.subjects.model import Subject

pytestmark = pytest.mark.asyncio


def _create_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subjectId": str(SUBJECT_UUID),
        "classId": str(CLASS_UUID),
        "title": "Fractions worksheet",
        "description": "Solve problems 1-10.",
        "dueDate": "2026-08-15",
    }
    body.update(overrides)
    return body


async def _create_assignment(
    client: AsyncClient, class_id: UUID = CLASS_UUID, title: str = "Task"
) -> str:
    res = await client.post(
        "/assignments",
        json=_create_body(classId=str(class_id), title=title),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


# ─── Create + list ──────────────────────────────────────────────────────────


async def test_teacher_creates_draft_assignment(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    res = await client.post(
        "/assignments", json=_create_body(), headers=auth_header(role="Teacher")
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == "draft"
    assert body["publishedAt"] is None
    assert body["teacherId"] == str(TEACHER_UUID)
    assert body["classId"] == str(CLASS_UUID)


async def test_create_rejects_unknown_class(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    res = await client.post(
        "/assignments",
        json=_create_body(classId=str(UUID("00000000-0000-4000-8000-000000000001"))),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 400


async def test_teacher_list_scopes_to_own(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    """Teacher passing a foreign `teacherId` is silently coerced to their
    own linked_id — no data leak."""
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    await _create_assignment(client, title="Mine")

    res = await client.get(
        f"/assignments?teacherId={OTHER_TEACHER_UUID}",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    body = res.json()
    # No matter what teacherId they asked for, they only see their own.
    assert all(item["teacherId"] == str(TEACHER_UUID) for item in body["items"])
    assert body["total"] >= 1


async def test_admin_can_see_all_teachers(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    await _create_assignment(client, title="One")
    res = await client.get(
        "/assignments", headers=auth_header(role="Admin", linked_id=str(ADMIN_UUID))
    )
    assert res.status_code == 200
    assert res.json()["total"] >= 1


async def test_deputy_can_filter_by_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    await _create_assignment(client, title="One")
    res = await client.get(
        f"/assignments?teacherId={TEACHER_UUID}",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_UUID)),
    )
    assert res.status_code == 200
    assert res.json()["total"] == 1


# ─── Get single ─────────────────────────────────────────────────────────────


async def test_get_owner_can_read(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.get(f"/assignments/{plan_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 200


async def test_get_foreign_teacher_403(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.get(
        f"/assignments/{plan_id}",
        headers=auth_header(role="Teacher", linked_id=str(OTHER_TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Update ─────────────────────────────────────────────────────────────────


async def test_owning_teacher_can_edit(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.patch(
        f"/assignments/{plan_id}",
        json={"title": "Renamed", "description": "Updated desc"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Renamed"


async def test_non_owner_cannot_edit(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.patch(
        f"/assignments/{plan_id}",
        json={"title": "Hijacked"},
        headers=auth_header(role="Teacher", linked_id=str(OTHER_TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Publish / Unpublish ────────────────────────────────────────────────────


async def test_publish_flips_status_and_stamps_time(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.post(f"/assignments/{plan_id}/publish", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "published"
    assert body["publishedAt"] is not None


async def test_publish_twice_conflicts(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    await client.post(f"/assignments/{plan_id}/publish", headers=auth_header(role="Teacher"))
    res = await client.post(f"/assignments/{plan_id}/publish", headers=auth_header(role="Teacher"))
    assert res.status_code == 409


async def test_unpublish_moves_back_to_draft(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    await client.post(f"/assignments/{plan_id}/publish", headers=auth_header(role="Teacher"))
    res = await client.post(
        f"/assignments/{plan_id}/unpublish", headers=auth_header(role="Teacher")
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft"
    assert body["publishedAt"] is None


async def test_publish_non_owner_403(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.post(
        f"/assignments/{plan_id}/publish",
        headers=auth_header(role="Teacher", linked_id=str(OTHER_TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Soft delete ────────────────────────────────────────────────────────────


async def test_owner_can_soft_delete(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.delete(f"/assignments/{plan_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 204
    # Now a fetch should 404 (deleted_at excludes it from reads).
    follow = await client.get(f"/assignments/{plan_id}", headers=auth_header(role="Teacher"))
    assert follow.status_code == 404


async def test_non_owner_cannot_soft_delete(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff)
    plan_id = await _create_assignment(client)
    res = await client.delete(
        f"/assignments/{plan_id}",
        headers=auth_header(role="Teacher", linked_id=str(OTHER_TEACHER_UUID)),
    )
    assert res.status_code == 403


# ─── Parent listing ─────────────────────────────────────────────────────────


async def test_parent_without_for_student_ids_400(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
    seed_parent_and_children: tuple[Guardian, Student, Student],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff, seed_parent_and_children)
    res = await client.get(
        "/assignments",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_UUID)),
    )
    assert res.status_code == 400


async def test_parent_owning_students_sees_published_only(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
    seed_parent_and_children: tuple[Guardian, Student, Student],
) -> None:
    _ = (seed_school, seed_classes, seed_subject, seed_staff, seed_parent_and_children)

    # Teacher creates two assignments: one for CLASS_UUID (child A's class),
    # one for CLASS_OTHER_UUID (child B's class). Only the first is published.
    published_id = await _create_assignment(client, class_id=CLASS_UUID, title="Pub A")
    await client.post(f"/assignments/{published_id}/publish", headers=auth_header(role="Teacher"))
    await _create_assignment(client, class_id=CLASS_OTHER_UUID, title="Draft B")

    res = await client.get(
        f"/assignments?forStudentIds={STUDENT_UUID}&forStudentIds={STUDENT_OTHER_UUID}",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_UUID)),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "Pub A"
    assert items[0]["status"] == "published"


async def test_parent_cannot_query_foreign_students(
    client: AsyncClient,
    seed_school: School,
    seed_classes: tuple[Class, Class],
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
    seed_parent_and_children: tuple[Guardian, Student, Student],
) -> None:
    """A guardian who doesn't own STUDENT_UUID must 403."""
    _ = (seed_school, seed_classes, seed_subject, seed_staff, seed_parent_and_children)
    res = await client.get(
        f"/assignments?forStudentIds={STUDENT_UUID}",
        headers=auth_header(role="Parent", linked_id=str(OTHER_GUARDIAN_UUID)),
    )
    assert res.status_code == 403
