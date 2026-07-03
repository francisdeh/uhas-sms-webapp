"""End-to-end tests for `GET /search`.

Coverage groups:
  1. Short/empty query short-circuits
  2. Admin sees hits across all three domains
  3. Deputy scope limits results to their own division
  4. Teacher scope limits students to their own classes and returns
     no staff/classes
  5. Parent scope limits students to their own child
  6. Staff email search
  7. Per-domain 8-result cap
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.features.search.tests.conftest import (
    ADMIN_STAFF,
    ADMIN_USER,
    DEPUTY_JHS_STAFF,
    DEPUTY_JHS_USER,
    GUARDIAN_UUID,
    PARENT_USER,
    STUDENT_CHILD,
    STUDENT_JHS1_A,
    STUDENT_JHS1_B,
    STUDENT_JHS2,
    STUDENT_KG,
    TEACHER_JHS_STAFF,
    TEACHER_JHS_USER,
    auth_header,
)

pytestmark = pytest.mark.asyncio


async def test_empty_q_returns_empty_payload(client: AsyncClient) -> None:
    """Empty query must not touch the DB — no seed loaded here."""
    r = await client.get(
        "/search",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"students": [], "staff": [], "classes": []}


async def test_single_char_q_returns_empty_payload(client: AsyncClient) -> None:
    """Single-character query is below the min length and short-circuits."""
    r = await client.get(
        "/search?q=a",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200
    assert r.json() == {"students": [], "staff": [], "classes": []}


async def test_admin_sees_students_staff_and_classes(client: AsyncClient, seed: None) -> None:
    """Admin can search across all three domains without scope filter."""
    _ = seed
    r = await client.get(
        "/search?q=amaru",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    student_ids = {s["id"] for s in body["students"]}
    assert student_ids == {
        str(STUDENT_JHS1_A),
        str(STUDENT_JHS1_B),
        str(STUDENT_JHS2),
        str(STUDENT_KG),
        str(STUDENT_CHILD),
    }
    # Class label populated from the current-year Active enrollment.
    by_id = {s["id"]: s for s in body["students"]}
    assert by_id[str(STUDENT_JHS1_A)]["class"] == "JHS 1"
    assert by_id[str(STUDENT_KG)]["class"] == "KG 1"

    # `Ama` matches Ama Teacher on first_name and admin's slug prefix.
    r_staff = await client.get(
        "/search?q=ama",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    staff_names = {s["name"] for s in r_staff.json()["staff"]}
    assert "Ama Teacher" in staff_names

    # `jhs` matches JHS 1 + JHS 2 by class name.
    r_cls = await client.get(
        "/search?q=jhs",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    class_names = {c["name"] for c in r_cls.json()["classes"]}
    assert "JHS 1" in class_names
    assert "JHS 2" in class_names


async def test_deputy_only_sees_own_division_hits(client: AsyncClient, seed: None) -> None:
    """JHS deputy should see JHS students + classes only, never KG."""
    _ = seed
    r = await client.get(
        "/search?q=amaru",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    student_ids = {s["id"] for s in body["students"]}
    # JHS 1 + JHS 2 students visible; KG student filtered out.
    assert student_ids == {
        str(STUDENT_JHS1_A),
        str(STUDENT_JHS1_B),
        str(STUDENT_JHS2),
        str(STUDENT_CHILD),
    }
    assert str(STUDENT_KG) not in student_ids

    # Classes: query "25" sweeps every class's slug, so the deputy's
    # division filter is the only thing that could exclude KG 1.
    r_cls = await client.get(
        "/search?q=25",
        headers=auth_header(
            role="DeputyHead",
            user_id=DEPUTY_JHS_USER,
            linked_id=DEPUTY_JHS_STAFF,
        ),
    )
    class_names = {c["name"] for c in r_cls.json()["classes"]}
    assert "JHS 1" in class_names
    assert "JHS 2" in class_names
    assert "KG 1" not in class_names
    assert "Primary 3 A" not in class_names


async def test_teacher_only_sees_own_class_students(client: AsyncClient, seed: None) -> None:
    """The JHS 1 teacher sees only JHS 1 students; no staff, no classes."""
    _ = seed
    r = await client.get(
        "/search?q=amaru",
        headers=auth_header(
            role="Teacher",
            user_id=TEACHER_JHS_USER,
            linked_id=TEACHER_JHS_STAFF,
        ),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    student_ids = {s["id"] for s in body["students"]}
    assert student_ids == {str(STUDENT_JHS1_A), str(STUDENT_JHS1_B)}
    # Teacher scope trims staff + classes entirely.
    assert body["staff"] == []
    assert body["classes"] == []


async def test_parent_only_sees_own_child(client: AsyncClient, seed: None) -> None:
    """Parents can only pull back students whose guardian record links to them."""
    _ = seed
    r = await client.get(
        "/search?q=amaru",
        headers=auth_header(
            role="Parent",
            user_id=PARENT_USER,
            linked_id=GUARDIAN_UUID,
        ),
    )
    assert r.status_code == 200, r.text
    body = r.json()

    assert len(body["students"]) == 1
    assert body["students"][0]["id"] == str(STUDENT_CHILD)
    assert body["staff"] == []
    assert body["classes"] == []


async def test_staff_email_search_admin(client: AsyncClient, seed: None) -> None:
    """The distinctive email staff row is only reachable via email match."""
    _ = seed
    r = await client.get(
        "/search?q=findme",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    staff_names = [s["name"] for s in body["staff"]]
    assert staff_names == ["Zebra Zulu"]


async def test_per_domain_cap_of_eight(client: AsyncClient, seed: None) -> None:
    """The seed loads 10 `capacity` students — the endpoint must return 8."""
    _ = seed
    r = await client.get(
        "/search?q=capacity",
        headers=auth_header(role="Admin", user_id=ADMIN_USER, linked_id=ADMIN_STAFF),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["students"]) == 8
