"""HTTP-level tests for /classes and its two junction sub-resources."""

from __future__ import annotations

from httpx import AsyncClient

from app.features.classes.tests.conftest import (
    OTHER_SCHOOL_UUID,
    SCHOOL_UUID,
    STAFF_UUID,
    SUBJECT_UUID,
    auth_header,
)
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.subjects.model import Subject

_CLASS_BODY = {
    "slug": "class-jhs1",
    "name": "JHS 1",
    "division": "JHS",
    "academicYear": "2025/2026",
}


# ─── /classes CRUD ───────────────────────────────────────────────────────────


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/classes")
    assert res.status_code == 401


async def test_create_requires_admin(client: AsyncClient, seed_school: School) -> None:
    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role=role))
        assert res.status_code == 403


async def test_create_round_trips(client: AsyncClient, seed_school: School) -> None:
    res = await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    body = res.json()
    assert body["slug"] == "class-jhs1"
    assert body["academicYear"] == "2025/2026"


async def test_create_409_on_duplicate_slug_same_year(
    client: AsyncClient, seed_school: School
) -> None:
    await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    res = await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 409


async def test_same_slug_rejected_even_in_different_year(
    client: AsyncClient, seed_school: School
) -> None:
    """DB constraint is `(school_id, slug)` — convention is to use
    year-suffixed slugs like `class-jhs1-2027` when creating a class in
    a subsequent year, not to reuse the slug."""
    await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    res = await client.post(
        "/classes",
        json={**_CLASS_BODY, "academicYear": "2026/2027"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_filter_by_division_and_year(client: AsyncClient, seed_school: School) -> None:
    await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    await client.post(
        "/classes",
        json={"slug": "class-kg1", "name": "KG 1", "division": "KG", "academicYear": "2025/2026"},
        headers=auth_header(role="Admin"),
    )
    jhs = await client.get("/classes?division=JHS", headers=auth_header(role="Admin"))
    assert len(jhs.json()["items"]) == 1
    yr = await client.get("/classes?academicYear=2025/2026", headers=auth_header(role="Admin"))
    assert len(yr.json()["items"]) == 2


async def test_filter_by_class_teacher_id(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        "/classes",
        json={"slug": "class-kg1", "name": "KG 1", "division": "KG", "academicYear": "2025/2026"},
        headers=auth_header(role="Admin"),
    )
    await client.post(
        f"/classes/{cls['id']}/teachers",
        json={"staffId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )

    res = await client.get(
        f"/classes?classTeacherId={STAFF_UUID}", headers=auth_header(role="Admin")
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == cls["id"]


async def test_filter_by_class_teacher_id_empty_for_unassigned_staff(
    client: AsyncClient, seed_school: School
) -> None:
    await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ghost = "00000000-0000-4000-8000-000000000000"
    res = await client.get(f"/classes?classTeacherId={ghost}", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert res.json()["items"] == []


async def test_deputy_head_list_ignores_wider_division_param(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    """seed_teacher is JHS. A DeputyHead linked to that staff row must
    only ever see JHS classes — even when they explicitly ask for KG."""
    await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    await client.post(
        "/classes",
        json={"slug": "class-kg1", "name": "KG 1", "division": "KG", "academicYear": "2025/2026"},
        headers=auth_header(role="Admin"),
    )
    res = await client.get(
        "/classes?division=KG",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_UUID),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["division"] == "JHS"


async def test_deputy_head_can_get_class_in_own_division(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    created = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.get(
        f"/classes/{created['id']}",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_UUID),
    )
    assert res.status_code == 200


async def test_deputy_head_cannot_get_class_outside_division(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    created = (
        await client.post(
            "/classes",
            json={
                "slug": "class-kg1",
                "name": "KG 1",
                "division": "KG",
                "academicYear": "2025/2026",
            },
            headers=auth_header(role="Admin"),
        )
    ).json()
    res = await client.get(
        f"/classes/{created['id']}",
        headers=auth_header(role="DeputyHead", linked_id=STAFF_UUID),
    )
    assert res.status_code == 403


async def test_cross_school_scoping(client: AsyncClient, seed_school: School) -> None:
    await client.post(
        "/classes", json=_CLASS_BODY, headers=auth_header(role="Admin", school_id=SCHOOL_UUID)
    )
    res = await client.get(
        "/classes", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res.status_code == 200
    assert res.json()["items"] == []


# ─── /classes/{id}/subjects ──────────────────────────────────────────────────


async def test_assign_subject_to_class(
    client: AsyncClient, seed_school: School, seed_subject: Subject, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID), "teacherId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201
    body = res.json()
    assert body["subjectSlug"] == "MATH"
    assert body["teacherFirstName"] == "Ama"


async def test_assign_subject_400_for_unknown_subject(
    client: AsyncClient, seed_school: School
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": "99999999-9999-4999-8999-999999999999"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 400


async def test_assign_subject_409_on_duplicate(
    client: AsyncClient, seed_school: School, seed_subject: Subject
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_set_class_subject_teacher(
    client: AsyncClient, seed_school: School, seed_subject: Subject, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.patch(
        f"/classes/{cls['id']}/subjects/{SUBJECT_UUID}",
        json={"teacherId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["teacherId"] == str(STAFF_UUID)


async def test_unset_class_subject_teacher(
    client: AsyncClient, seed_school: School, seed_subject: Subject, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID), "teacherId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.patch(
        f"/classes/{cls['id']}/subjects/{SUBJECT_UUID}",
        json={"teacherId": None},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["teacherId"] is None


async def test_list_class_subjects(
    client: AsyncClient, seed_school: School, seed_subject: Subject
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.get(f"/classes/{cls['id']}/subjects", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1


async def test_remove_class_subject(
    client: AsyncClient, seed_school: School, seed_subject: Subject
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/subjects",
        json={"subjectId": str(SUBJECT_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.delete(
        f"/classes/{cls['id']}/subjects/{SUBJECT_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 204

    listed = await client.get(f"/classes/{cls['id']}/subjects", headers=auth_header(role="Admin"))
    assert listed.json()["items"] == []


# ─── /classes/{id}/teachers ──────────────────────────────────────────────────


async def test_assign_class_teacher(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    res = await client.post(
        f"/classes/{cls['id']}/teachers",
        json={"staffId": str(STAFF_UUID), "isPrimary": True},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201
    assert res.json()["isPrimary"] is True
    assert res.json()["staffFirstName"] == "Ama"


async def test_list_class_teachers(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/teachers",
        json={"staffId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.get(f"/classes/{cls['id']}/teachers", headers=auth_header(role="Admin"))
    assert len(res.json()["items"]) == 1


async def test_remove_class_teacher(
    client: AsyncClient, seed_school: School, seed_teacher: Staff
) -> None:
    cls = (
        await client.post("/classes", json=_CLASS_BODY, headers=auth_header(role="Admin"))
    ).json()
    await client.post(
        f"/classes/{cls['id']}/teachers",
        json={"staffId": str(STAFF_UUID)},
        headers=auth_header(role="Admin"),
    )
    res = await client.delete(
        f"/classes/{cls['id']}/teachers/{STAFF_UUID}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 204
