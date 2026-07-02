"""HTTP-level tests for /schemes."""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

from app.features.classes.model import Class
from app.features.schemes.tests.conftest import (
    CLASS_UUID,
    DEPUTY_OTHER_UUID,
    DEPUTY_UUID,
    SUBJECT_UUID,
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
        "type": "work",
        "term": 2,
        "academicYear": "2025/2026",
        "title": "Term 2 Scheme of Work",
    }
    body.update(overrides)
    return body


async def _create_scheme(client: AsyncClient) -> str:
    res = await client.post("/schemes", json=_create_body(), headers=auth_header(role="Teacher"))
    assert res.status_code == 201
    return str(res.json()["id"])


async def test_create_starts_as_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    res = await client.post("/schemes", json=_create_body(), headers=auth_header(role="Teacher"))
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "draft"
    assert body["title"] == "Term 2 Scheme of Work"
    assert body["type"] == "work"


async def test_teacher_can_edit_own_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    res = await client.patch(
        f"/schemes/{scheme_id}",
        json={"title": "Revised"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "Revised"


async def test_cannot_edit_submitted_scheme(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.patch(
        f"/schemes/{scheme_id}",
        json={"title": "..."},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 409


async def test_submit_advances_and_stamps_submitted_at(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    res = await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "submitted"
    assert body["submittedAt"] is not None


async def test_unit_head_can_acknowledge(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={"comment": "Approved."},
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "acknowledged"
    assert body["reviewerComment"] == "Approved."
    assert body["reviewedById"] == str(UNIT_HEAD_UUID)


async def test_non_unit_head_teacher_cannot_acknowledge(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    # Owner tries to self-acknowledge.
    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 403


async def test_deputy_wrong_division_cannot_acknowledge(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_OTHER_UUID)),
    )
    assert res.status_code == 403


async def test_deputy_right_division_can_acknowledge(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_UUID)),
    )
    assert res.status_code == 200


async def test_acknowledged_is_terminal(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="Admin", linked_id=None),
    )
    # Second acknowledge should 400 (already acknowledged).
    res = await client.post(
        f"/schemes/{scheme_id}/acknowledge",
        json={},
        headers=auth_header(role="Admin", linked_id=None),
    )
    assert res.status_code == 400


async def test_teacher_can_soft_delete_own_draft(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_scheme(client)
    res = await client.delete(f"/schemes/{scheme_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 204
    detail = await client.get(f"/schemes/{scheme_id}", headers=auth_header(role="Teacher"))
    assert detail.status_code == 404


async def test_list_defaults_to_own_for_teacher(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    await _create_scheme(client)
    own = await client.get("/schemes", headers=auth_header(role="Teacher"))
    assert own.json()["total"] == 1
    other = await client.get(
        "/schemes",
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert other.json()["total"] == 0
