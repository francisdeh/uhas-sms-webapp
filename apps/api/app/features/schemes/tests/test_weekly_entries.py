"""HTTP tests for Scheme of Learning's structured weekly entries.

Covers: add/edit/remove gates (owning teacher, draft-only,
type=learning-only), duplicate-week conflict, submit validation
(learning requires an entry or a file), and that `type="work"`
behaviour is completely unaffected.
"""

from __future__ import annotations

from typing import Any

from httpx import AsyncClient

from app.features.classes.model import Class
from app.features.schemes.tests.conftest import (
    CLASS_UUID,
    SUBJECT_UUID,
    UNIT_HEAD_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject


def _learning_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "subjectId": str(SUBJECT_UUID),
        "classId": str(CLASS_UUID),
        "type": "learning",
        "term": 2,
        "academicYear": "2025/2026",
        "title": "Term 2 Scheme of Learning",
    }
    body.update(overrides)
    return body


async def _create_learning_scheme(client: AsyncClient) -> str:
    res = await client.post("/schemes", json=_learning_body(), headers=auth_header(role="Teacher"))
    assert res.status_code == 201, res.text
    return str(res.json()["id"])


def _entry_body(week: int = 1, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "week": week,
        "strand": "Introduction to Computing",
        "subStrand": "Components of Computers and Computer Systems",
        "contentStandard": "B7.1.1.1. Examine the parts of a computer",
        "indicators": "B7.1.1.1.1 Discuss the fourth-generation computers",
        "resources": "Textbook pages 1-5, sample hardware",
    }
    body.update(overrides)
    return body


async def test_add_entry_round_trips(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    res = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201, res.text
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["week"] == 1
    assert entries[0]["strand"] == "Introduction to Computing"
    assert entries[0]["resourceFileUrls"] == []


async def test_add_entry_with_resource_files(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    res = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(resourceFileUrls=["schemes/resource/a.png", "schemes/resource/b.mp4"]),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201, res.text
    assert res.json()["entries"][0]["resourceFileUrls"] == [
        "schemes/resource/a.png",
        "schemes/resource/b.mp4",
    ]


async def test_duplicate_week_conflicts(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(week=1),
        headers=auth_header(role="Teacher"),
    )
    dup = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(week=1),
        headers=auth_header(role="Teacher"),
    )
    assert dup.status_code == 409


async def test_update_entry(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    added = await client.post(
        f"/schemes/{scheme_id}/entries", json=_entry_body(), headers=auth_header(role="Teacher")
    )
    entry_id = added.json()["entries"][0]["id"]

    res = await client.patch(
        f"/schemes/{scheme_id}/entries/{entry_id}",
        json={"resources": "Updated resource list"},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200, res.text
    entries = res.json()["entries"]
    assert entries[0]["resources"] == "Updated resource list"
    assert entries[0]["strand"] == "Introduction to Computing"  # untouched


async def test_update_entry_to_duplicate_week_conflicts(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(week=1),
        headers=auth_header(role="Teacher"),
    )
    second = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(week=2),
        headers=auth_header(role="Teacher"),
    )
    second_id = second.json()["entries"][1]["id"]

    res = await client.patch(
        f"/schemes/{scheme_id}/entries/{second_id}",
        json={"week": 1},
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 409


async def test_remove_entry(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    added = await client.post(
        f"/schemes/{scheme_id}/entries", json=_entry_body(), headers=auth_header(role="Teacher")
    )
    entry_id = added.json()["entries"][0]["id"]

    res = await client.request(
        "DELETE",
        f"/schemes/{scheme_id}/entries/{entry_id}",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 200
    assert res.json()["entries"] == []


async def test_other_teacher_cannot_edit_entries(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    res = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(),
        headers=auth_header(role="Teacher", linked_id=str(UNIT_HEAD_UUID)),
    )
    assert res.status_code == 403


async def test_cannot_edit_entries_once_submitted(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    await client.post(
        f"/schemes/{scheme_id}/entries", json=_entry_body(), headers=auth_header(role="Teacher")
    )
    await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))

    res = await client.post(
        f"/schemes/{scheme_id}/entries",
        json=_entry_body(week=2),
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 409


async def test_work_type_scheme_rejects_entries(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    """Entries only belong to type="learning" — a Scheme of Work rejects them."""
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    res = await client.post(
        "/schemes",
        json={
            "subjectId": str(SUBJECT_UUID),
            "classId": str(CLASS_UUID),
            "type": "work",
            "term": 2,
            "academicYear": "2025/2026",
            "title": "Term 2 Scheme of Work",
            "content": "Week 1: ...",
        },
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 201
    work_scheme_id = res.json()["id"]

    entry_res = await client.post(
        f"/schemes/{work_scheme_id}/entries",
        json=_entry_body(),
        headers=auth_header(role="Teacher"),
    )
    assert entry_res.status_code == 400


async def test_submit_learning_scheme_without_entries_or_file_fails(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    res = await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 400


async def test_submit_learning_scheme_with_one_entry_succeeds(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    await client.post(
        f"/schemes/{scheme_id}/entries", json=_entry_body(), headers=auth_header(role="Teacher")
    )
    res = await client.post(f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher"))
    assert res.status_code == 200, res.text


async def test_submit_learning_scheme_with_file_only_succeeds(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    """The upload alternative still works with zero structured entries."""
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    res = await client.post(
        "/schemes",
        json=_learning_body(fileUrl="schemes/file/uploaded.docx"),
        headers=auth_header(role="Teacher"),
    )
    scheme_id = res.json()["id"]
    submit_res = await client.post(
        f"/schemes/{scheme_id}/submit", headers=auth_header(role="Teacher")
    )
    assert submit_res.status_code == 200, submit_res.text


async def test_get_scheme_includes_entries(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_subject: Subject,
    seed_staff: tuple[Staff, Staff, Staff, Staff],
) -> None:
    _ = (seed_school, seed_class, seed_subject, seed_staff)
    scheme_id = await _create_learning_scheme(client)
    await client.post(
        f"/schemes/{scheme_id}/entries", json=_entry_body(), headers=auth_header(role="Teacher")
    )
    res = await client.get(f"/schemes/{scheme_id}", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    assert len(res.json()["entries"]) == 1
