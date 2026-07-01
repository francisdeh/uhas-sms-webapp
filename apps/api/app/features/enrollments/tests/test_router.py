"""HTTP-level tests for /enrollments + the nested lookups."""

from __future__ import annotations

from httpx import AsyncClient

from app.features.classes.model import Class
from app.features.enrollments.tests.conftest import (
    CLASS_UUID,
    NEXT_CLASS_UUID,
    STUDENT_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.students.model import Student


async def test_enroll_requires_auth(client: AsyncClient) -> None:
    res = await client.post("/enrollments", json={})
    assert res.status_code == 401


async def test_enroll_requires_admin(
    client: AsyncClient, seed_school: School, seed_class: Class, seed_student: Student
) -> None:
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.post("/enrollments", json=body, headers=auth_header(role=role))
        assert res.status_code == 403


async def test_enroll_happy_path(
    client: AsyncClient, seed_school: School, seed_class: Class, seed_student: Student
) -> None:
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    res = await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    payload = res.json()
    assert payload["className"] == "JHS 1"
    assert payload["status"] == "Active"


async def test_enroll_409_if_already_active_for_year(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_next_class: Class,
    seed_student: Student,
) -> None:
    """A student can't hold two Active enrollments in the same academic year."""
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))

    other = {"studentId": str(STUDENT_UUID), "classId": str(NEXT_CLASS_UUID)}
    res = await client.post("/enrollments", json=other, headers=auth_header(role="Admin"))
    assert res.status_code == 409


async def test_enroll_400_for_unknown_student(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    body = {
        "studentId": "99999999-9999-4999-8999-999999999999",
        "classId": str(CLASS_UUID),
    }
    res = await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))
    assert res.status_code == 400


async def test_change_status_transitions_and_409_on_repeat(
    client: AsyncClient, seed_school: School, seed_class: Class, seed_student: Student
) -> None:
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    created = (
        await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))
    ).json()

    res = await client.patch(
        f"/enrollments/{created['id']}",
        json={"status": "Repeating"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "Repeating"

    # Second call with same status = no-op → 409.
    res2 = await client.patch(
        f"/enrollments/{created['id']}",
        json={"status": "Repeating"},
        headers=auth_header(role="Admin"),
    )
    assert res2.status_code == 409


async def test_list_by_student(
    client: AsyncClient, seed_school: School, seed_class: Class, seed_student: Student
) -> None:
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))

    res = await client.get(
        f"/students/{STUDENT_UUID}/enrollments", headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["className"] == "JHS 1"


async def test_list_by_class_filters_by_status(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    seed_student: Student,
) -> None:
    body = {"studentId": str(STUDENT_UUID), "classId": str(CLASS_UUID)}
    created = (
        await client.post("/enrollments", json=body, headers=auth_header(role="Admin"))
    ).json()

    # Match on Active
    active = await client.get(
        f"/classes/{CLASS_UUID}/enrollments?status=Active",
        headers=auth_header(role="Admin"),
    )
    assert len(active.json()["items"]) == 1

    # Flip to Withdrawn, then the Active filter should miss it
    await client.patch(
        f"/enrollments/{created['id']}",
        json={"status": "Withdrawn"},
        headers=auth_header(role="Admin"),
    )
    active_after = await client.get(
        f"/classes/{CLASS_UUID}/enrollments?status=Active",
        headers=auth_header(role="Admin"),
    )
    assert active_after.json()["items"] == []
