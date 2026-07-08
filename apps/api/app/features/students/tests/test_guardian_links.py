"""HTTP tests for the student↔guardian link surface + siblings.

Covers: list all guardians, create-new + link-existing add modes, the
max-two cap, primary-flag exclusivity, unlink (keeps the guardian row),
sibling derivation from a shared guardian, the create/new XOR validator,
relation validation, and the Admin/Deputy read + Admin-only write gates.
"""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.classes.model import Class
from app.features.enrollments.model import Enrollment
from app.features.guardians.model import Guardian
from app.features.schools.model import School
from app.features.staff.model import Staff
from app.features.students.model import Student, StudentGuardian
from app.features.students.tests.conftest import CLASS_UUID, SCHOOL_UUID, auth_header
from app.features.users.model import User

STUDENT_A = UUID("55555555-5555-4555-8555-555555555a01")
STUDENT_B = UUID("55555555-5555-4555-8555-555555555a02")
GUARDIAN_EXISTING = UUID("55555555-5555-4555-8555-555555555b01")
DEPUTY_JHS = UUID("55555555-5555-4555-8555-555555555c01")
DEPUTY_KG = UUID("55555555-5555-4555-8555-555555555c02")


@pytest_asyncio.fixture
async def seed_links(db_session: AsyncSession, seed_school: School, seed_class: Class) -> None:
    _ = (seed_school, seed_class)
    db_session.add_all(
        [
            Student(
                id=STUDENT_A,
                slug="STU-LNK-A",
                school_id=SCHOOL_UUID,
                first_name="Ama",
                last_name="Mensah",
                is_active=True,
            ),
            Student(
                id=STUDENT_B,
                slug="STU-LNK-B",
                school_id=SCHOOL_UUID,
                first_name="Kwame",
                last_name="Mensah",
                is_active=True,
            ),
            Guardian(
                id=GUARDIAN_EXISTING,
                slug="GRD-LNK-1",
                school_id=SCHOOL_UUID,
                first_name="Efua",
                last_name="Mensah",
                # Guardian email/phone are GLOBALLY unique — use a test-only
                # domain so we never collide with committed seed data on the
                # shared dev DB.
                email="efua.existing@example.com",
            ),
            Staff(
                id=DEPUTY_JHS,
                slug="STAFF-LNK-DHJ",
                school_id=SCHOOL_UUID,
                first_name="Yaa",
                last_name="DeputyJhs",
                system_role="DeputyHead",
                division="JHS",
                is_active=True,
            ),
            Staff(
                id=DEPUTY_KG,
                slug="STAFF-LNK-DHK",
                school_id=SCHOOL_UUID,
                first_name="Kojo",
                last_name="DeputyKg",
                system_role="DeputyHead",
                division="KG",
                is_active=True,
            ),
        ]
    )
    await db_session.flush()
    # Both students actively enrolled in the JHS seed class.
    db_session.add_all(
        [
            Enrollment(
                student_id=STUDENT_A,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
            Enrollment(
                student_id=STUDENT_B,
                class_id=CLASS_UUID,
                academic_year="2025/2026",
                status="Active",
                enrollment_date=date(2025, 9, 8),
            ),
        ]
    )
    await db_session.flush()


def _new_guardian_body(
    first: str, email: str, relation: str = "Mother", primary: bool = False
) -> dict[str, Any]:
    return {
        "relation": relation,
        "isPrimary": primary,
        "newGuardian": {"firstName": first, "lastName": "Test", "email": email},
    }


# ─── Add: create-new + link-existing ─────────────────────────────────────────


async def test_add_new_guardian_then_list(client: AsyncClient, seed_links: None) -> None:
    res = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json=_new_guardian_body("Adjoa", "adjoa@example.com", relation="Mother", primary=True),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert len(body) == 1
    assert body[0]["name"] == "Adjoa Test"
    assert body[0]["relationship"] == "Mother"
    assert body[0]["isPrimary"] is True


async def test_link_existing_guardian(client: AsyncClient, seed_links: None) -> None:
    res = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Guardian", "guardianId": str(GUARDIAN_EXISTING)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text
    assert res.json()[0]["id"] == str(GUARDIAN_EXISTING)


async def test_max_two_guardians_rejected(client: AsyncClient, seed_links: None) -> None:
    for i in range(2):
        r = await client.post(
            f"/students/{STUDENT_A}/guardians",
            json=_new_guardian_body(f"G{i}", f"g{i}@example.com"),
            headers=auth_header(role="Admin"),
        )
        assert r.status_code == 201, r.text
    third = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json=_new_guardian_body("Third", "third@example.com"),
        headers=auth_header(role="Admin"),
    )
    assert third.status_code == 409


async def test_relinking_same_guardian_conflicts(client: AsyncClient, seed_links: None) -> None:
    body = {"relation": "Guardian", "guardianId": str(GUARDIAN_EXISTING)}
    first = await client.post(
        f"/students/{STUDENT_A}/guardians", json=body, headers=auth_header(role="Admin")
    )
    assert first.status_code == 201
    dup = await client.post(
        f"/students/{STUDENT_A}/guardians", json=body, headers=auth_header(role="Admin")
    )
    assert dup.status_code == 409


async def test_new_guardian_duplicate_email_conflicts(
    client: AsyncClient, seed_links: None
) -> None:
    # GUARDIAN_EXISTING already owns efua.existing@example.com.
    res = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json=_new_guardian_body("Dupe", "efua.existing@example.com"),
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 409


async def test_xor_validator_rejects_both_and_neither(
    client: AsyncClient, seed_links: None
) -> None:
    both = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={
            "relation": "Mother",
            "guardianId": str(GUARDIAN_EXISTING),
            "newGuardian": {"firstName": "X", "lastName": "Y", "phone": "+233200000050"},
        },
        headers=auth_header(role="Admin"),
    )
    assert both.status_code == 422
    neither = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Mother"},
        headers=auth_header(role="Admin"),
    )
    assert neither.status_code == 422


async def test_invalid_relation_rejected(client: AsyncClient, seed_links: None) -> None:
    res = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Cousin", "guardianId": str(GUARDIAN_EXISTING)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 422


# ─── Primary exclusivity, update, unlink ─────────────────────────────────────


async def test_setting_primary_clears_others(client: AsyncClient, seed_links: None) -> None:
    await client.post(
        f"/students/{STUDENT_A}/guardians",
        json=_new_guardian_body("First", "first@example.com", primary=True),
        headers=auth_header(role="Admin"),
    )
    add_second = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Father", "guardianId": str(GUARDIAN_EXISTING), "isPrimary": True},
        headers=auth_header(role="Admin"),
    )
    assert add_second.status_code == 201
    primaries = [g for g in add_second.json() if g["isPrimary"]]
    assert len(primaries) == 1
    assert primaries[0]["id"] == str(GUARDIAN_EXISTING)


async def test_unlink_keeps_guardian_row(
    client: AsyncClient, db_session: AsyncSession, seed_links: None
) -> None:
    await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Guardian", "guardianId": str(GUARDIAN_EXISTING)},
        headers=auth_header(role="Admin"),
    )
    res = await client.request(
        "DELETE",
        f"/students/{STUDENT_A}/guardians/{GUARDIAN_EXISTING}",
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json() == []
    # Link gone, guardian record remains.
    link = (
        await db_session.execute(
            select(StudentGuardian).where(StudentGuardian.student_id == STUDENT_A)
        )
    ).first()
    assert link is None
    guardian = (
        await db_session.execute(select(Guardian).where(Guardian.id == GUARDIAN_EXISTING))
    ).scalar_one_or_none()
    assert guardian is not None


# ─── Siblings ────────────────────────────────────────────────────────────────


async def test_shared_guardian_makes_siblings(client: AsyncClient, seed_links: None) -> None:
    body = {"relation": "Mother", "guardianId": str(GUARDIAN_EXISTING)}
    await client.post(
        f"/students/{STUDENT_A}/guardians", json=body, headers=auth_header(role="Admin")
    )
    await client.post(
        f"/students/{STUDENT_B}/guardians", json=body, headers=auth_header(role="Admin")
    )

    a_sibs = await client.get(f"/students/{STUDENT_A}/siblings", headers=auth_header(role="Admin"))
    assert a_sibs.status_code == 200
    ids = [s["id"] for s in a_sibs.json()]
    assert ids == [str(STUDENT_B)]

    b_sibs = await client.get(f"/students/{STUDENT_B}/siblings", headers=auth_header(role="Admin"))
    assert [s["id"] for s in b_sibs.json()] == [str(STUDENT_A)]


async def test_siblings_empty_without_shared_guardian(
    client: AsyncClient, seed_links: None
) -> None:
    await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Mother", "guardianId": str(GUARDIAN_EXISTING)},
        headers=auth_header(role="Admin"),
    )
    res = await client.get(f"/students/{STUDENT_A}/siblings", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert res.json() == []


# ─── Auth gates ──────────────────────────────────────────────────────────────


async def test_deputy_same_division_can_read(client: AsyncClient, seed_links: None) -> None:
    res = await client.get(
        f"/students/{STUDENT_A}/guardians",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS)),
    )
    assert res.status_code == 200


async def test_deputy_other_division_cannot_read(client: AsyncClient, seed_links: None) -> None:
    res = await client.get(
        f"/students/{STUDENT_A}/guardians",
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_KG)),
    )
    assert res.status_code == 403


async def test_deputy_cannot_mutate(client: AsyncClient, seed_links: None) -> None:
    res = await client.post(
        f"/students/{STUDENT_A}/guardians",
        json={"relation": "Guardian", "guardianId": str(GUARDIAN_EXISTING)},
        headers=auth_header(role="DeputyHead", linked_id=str(DEPUTY_JHS)),
    )
    assert res.status_code == 403


async def test_teacher_cannot_read(client: AsyncClient, seed_links: None) -> None:
    res = await client.get(
        f"/students/{STUDENT_A}/guardians",
        headers=auth_header(role="Teacher"),
    )
    assert res.status_code == 403


# ─── Parent co-guardian access + hasLogin ────────────────────────────────────


async def _link(client: AsyncClient, student: UUID, guardian: UUID) -> None:
    res = await client.post(
        f"/students/{student}/guardians",
        json={"relation": "Mother", "guardianId": str(guardian)},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 201, res.text


async def test_parent_can_read_own_childs_co_guardians(
    client: AsyncClient, seed_links: None
) -> None:
    await _link(client, STUDENT_A, GUARDIAN_EXISTING)
    # The parent IS this guardian → may see the child's guardian list.
    res = await client.get(
        f"/students/{STUDENT_A}/guardians",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_EXISTING)),
    )
    assert res.status_code == 200
    assert [g["id"] for g in res.json()] == [str(GUARDIAN_EXISTING)]


async def test_parent_cannot_read_unrelated_childs_guardians(
    client: AsyncClient, seed_links: None
) -> None:
    await _link(client, STUDENT_A, GUARDIAN_EXISTING)
    # Same parent, but STUDENT_B is not their child.
    res = await client.get(
        f"/students/{STUDENT_B}/guardians",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_EXISTING)),
    )
    assert res.status_code == 403


async def test_parent_still_cannot_read_siblings(client: AsyncClient, seed_links: None) -> None:
    await _link(client, STUDENT_A, GUARDIAN_EXISTING)
    res = await client.get(
        f"/students/{STUDENT_A}/siblings",
        headers=auth_header(role="Parent", linked_id=str(GUARDIAN_EXISTING)),
    )
    assert res.status_code == 403


async def test_has_login_reflected(
    client: AsyncClient, db_session: AsyncSession, seed_links: None
) -> None:
    await _link(client, STUDENT_A, GUARDIAN_EXISTING)
    before = await client.get(f"/students/{STUDENT_A}/guardians", headers=auth_header(role="Admin"))
    assert before.json()[0]["hasLogin"] is False

    # A bridge row linking this guardian → hasLogin flips true.
    db_session.add(
        User(
            id=UUID("55555555-5555-4555-8555-5555555550f1"),
            school_id=SCHOOL_UUID,
            email="haslogin@example.com",
            role="Parent",
            linked_id=GUARDIAN_EXISTING,
            is_active=True,
        )
    )
    await db_session.flush()
    after = await client.get(f"/students/{STUDENT_A}/guardians", headers=auth_header(role="Admin"))
    assert after.json()[0]["hasLogin"] is True
