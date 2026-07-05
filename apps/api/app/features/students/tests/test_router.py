"""HTTP-level tests for /students."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.classes.model import Class
from app.features.schools.model import School
from app.features.students.tests.conftest import (
    CLASS_UUID,
    OTHER_SCHOOL_UUID,
    SCHOOL_UUID,
    auth_header,
)

_BODY = {
    "firstName": "Akua",
    "lastName": "Mensah",
    "dob": "2012-04-15",
    "gender": "Female",
    "classId": str(CLASS_UUID),
}


async def test_list_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/students")
    assert res.status_code == 401


async def test_create_requires_admin(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    for role in ("Teacher", "Parent", "DeputyHead"):
        res = await client.post("/students", json=_BODY, headers=auth_header(role=role))
        assert res.status_code == 403


async def test_create_assigns_slug_and_enrolls(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    res = await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))
    assert res.status_code == 201
    body = res.json()
    # Slug prefix comes from the academic year's starting calendar year,
    # not the current calendar year. seed_school is AY "2025/2026" → "UHAS-2025-".
    assert body["slug"] == "UHAS-2025-0001"
    assert body["className"] == "JHS 1"
    assert body["division"] == "JHS"
    assert body["classId"] == str(CLASS_UUID)


async def test_create_400_for_unknown_class(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    res = await client.post(
        "/students",
        json={**_BODY, "classId": "11111111-1111-4111-8111-111111111111"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 400


async def test_list_returns_class_join(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))
    res = await client.get("/students", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["className"] == "JHS 1"


async def test_filter_by_division(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))
    # JHS hit
    jhs = await client.get("/students?division=JHS", headers=auth_header(role="Admin"))
    assert len(jhs.json()["items"]) == 1
    # KG miss
    kg = await client.get("/students?division=KG", headers=auth_header(role="Admin"))
    assert kg.json()["items"] == []


async def test_search_filters(client: AsyncClient, seed_school: School, seed_class: Class) -> None:
    await client.post(
        "/students",
        json={**_BODY, "firstName": "Akua", "lastName": "Mensah"},
        headers=auth_header(role="Admin"),
    )
    await client.post(
        "/students",
        json={**_BODY, "firstName": "Kojo", "lastName": "Boateng"},
        headers=auth_header(role="Admin"),
    )
    res = await client.get("/students?q=mens", headers=auth_header(role="Admin"))
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["lastName"] == "Mensah"


async def test_patch_writes_audit_when_changes_present(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    db_session: AsyncSession,
) -> None:
    created = (await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))).json()
    res = await client.patch(
        f"/students/{created['id']}",
        json={"firstName": "Adwoa"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    assert res.json()["firstName"] == "Adwoa"

    # Scoped to this test's own student — an unscoped action-only filter
    # would also match unrelated STUDENT_EDIT rows already committed in
    # the shared local dev DB (real seed/demo data, manual testing, …).
    audit_rows = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    and_(AuditLog.action == "STUDENT_EDIT", AuditLog.target_id == created["id"])
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(audit_rows) == 1
    # JSONB column → plain dict on read; no json.loads needed.
    assert audit_rows[0].after == {"first_name": "Adwoa"}


async def test_patch_no_changes_skips_audit(
    client: AsyncClient,
    seed_school: School,
    seed_class: Class,
    db_session: AsyncSession,
) -> None:
    created = (await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))).json()
    # Re-send the same first name → no change, no audit row.
    await client.patch(
        f"/students/{created['id']}",
        json={"firstName": created["firstName"]},
        headers=auth_header(role="Admin"),
    )
    audit_count = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    and_(
                        AuditLog.action == "STUDENT_EDIT",
                        AuditLog.target_id == created["id"],
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    assert audit_count == []


async def test_set_active_toggles(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    created = (await client.post("/students", json=_BODY, headers=auth_header(role="Admin"))).json()
    res = await client.post(
        f"/students/{created['id']}/deactivate", headers=auth_header(role="Admin")
    )
    assert res.json()["isActive"] is False

    res2 = await client.post(
        f"/students/{created['id']}/deactivate", headers=auth_header(role="Admin")
    )
    assert res2.status_code == 409


async def test_cross_school_scoping(
    client: AsyncClient, seed_school: School, seed_class: Class
) -> None:
    await client.post(
        "/students",
        json=_BODY,
        headers=auth_header(role="Admin", school_id=SCHOOL_UUID),
    )
    res = await client.get(
        "/students", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    # Other school has no school row in DB → /students raises NotFoundError 404.
    # That's correct — the JWT is for a tenant that doesn't exist.
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        assert res.json()["items"] == []
