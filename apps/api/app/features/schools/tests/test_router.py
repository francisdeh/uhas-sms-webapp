"""HTTP-level tests for /school endpoints.

Covers:
  - Auth (401 missing/bad token, 403 non-admin on PATCH)
  - Happy path (GET returns row, PATCH applies + responds with updated)
  - Validation (422 when score weights don't sum to 100)
  - The scope guard: a token scoped to one school can never see another's
    settings, because the school_id comes from the JWT, not the URL.

Tests use httpx.AsyncClient (not fastapi.testclient.TestClient) — see
conftest.py for the rationale.
"""

from __future__ import annotations

from uuid import UUID

from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.audit.model import AuditLog
from app.features.schools.model import School
from app.features.schools.tests.conftest import (
    OTHER_SCHOOL_UUID,
    SCHOOL_UUID,
    auth_header,
)

# ─── GET /school ─────────────────────────────────────────────────────────────


async def test_get_school_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/school")
    assert res.status_code == 401


# ─── GET /school/public ──────────────────────────────────────────────────────
#
# `get_first_active` is the one unscoped ("get anything active") query in
# this domain — every other test here queries by a pinned UUID, which is
# safe to run against a shared local dev DB regardless of what else is
# committed in it. An unscoped query isn't, so these tests deactivate
# (not delete — real seeded rows have FKs from other tables) any other
# school inside their own rolled-back transaction first, rather than
# assuming the table starts empty.


async def test_get_school_public_requires_no_auth(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/school/public")
    assert res.status_code == 200


async def test_get_school_public_returns_cosmetic_fields_only(
    client: AsyncClient, db_session: AsyncSession, seed_school: School
) -> None:
    await db_session.execute(
        text("UPDATE schools SET is_active = false WHERE id != :id"), {"id": str(SCHOOL_UUID)}
    )
    res = await client.get("/school/public")
    body = res.json()
    assert body == {"name": "Test School", "motto": None, "logoUrl": None}


async def test_get_school_public_404s_when_no_active_school(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await db_session.execute(text("UPDATE schools SET is_active = false"))
    res = await client.get("/school/public")
    assert res.status_code == 404


async def test_get_school_returns_caller_school(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/school", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    # JSON wire format is camelCase (alias_generator=to_camel). UUID
    # compares to its str form via str cast since JSON serialises uuid → string.
    assert body["id"] == str(SCHOOL_UUID)
    assert body["slug"] == "test-school"
    assert body["name"] == "Test School"
    assert body["academicYear"] == "2025/2026"


async def test_get_school_works_for_non_admin_roles(
    client: AsyncClient, seed_school: School
) -> None:
    """Reads are open to any role with a valid school_id claim — settings
    drive UI on every dashboard, not just /admin/settings."""
    for role in ("Admin", "DeputyHead", "Teacher", "Parent", "Accountant"):
        res = await client.get("/school", headers=auth_header(role=role))
        assert res.status_code == 200, f"role={role} should read /school"


async def test_get_school_returns_404_when_row_missing(client: AsyncClient) -> None:
    """JWT claims a school_id (uuid) that doesn't exist in the DB.

    The auth dep can't catch this — it only checks the claim is present.
    The service raises NotFoundError → 404 via the AppError handler.
    """
    ghost = UUID("99999999-9999-4999-8999-999999999999")
    res = await client.get("/school", headers=auth_header(role="Admin", school_id=ghost))
    assert res.status_code == 404


async def test_get_school_without_school_claim_is_403(
    client: AsyncClient, seed_school: School
) -> None:
    """A JWT with no school_id → 403, not 200 or 500."""
    res = await client.get("/school", headers=auth_header(role="Admin", school_id=None))
    assert res.status_code == 403


# ─── GET /school/grading-defaults ────────────────────────────────────────────


async def test_grading_defaults_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/school/grading-defaults")
    assert res.status_code == 401


async def test_grading_defaults_returns_ges_standard(client: AsyncClient) -> None:
    """The fixed national standard — a constant, independent of any
    school row (no seed_school fixture needed)."""
    res = await client.get("/school/grading-defaults", headers=auth_header(role="Teacher"))
    assert res.status_code == 200
    body = res.json()
    assert len(body["gradingBands"]) == 9
    assert body["gradingBands"][0] == {
        "min": 90,
        "max": 100,
        "grade": "1",
        "interpretation": "Highest",
    }
    assert body["scoreWeights"] == {
        "exam": 60,
        "cat1": 10,
        "cat2": 10,
        "groupWork": 10,
        "projectWork": 10,
    }
    assert body["passMark"] == 40


async def test_grading_defaults_is_cacheable(client: AsyncClient) -> None:
    res = await client.get("/school/grading-defaults", headers=auth_header(role="Admin"))
    assert res.headers["cache-control"] == "public, max-age=3600"


# ─── Cross-scope guarantee ───────────────────────────────────────────────────


async def test_jwt_scopes_response_to_its_own_school(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Two schools exist in the DB; the JWT for school A only sees A's data.

    This is the migration plan's "done when" assertion: a token scoped to
    school X cannot read school Y's resources. For endpoints like
    /school that take no path school_id, the guarantee is mechanical —
    the school_id always comes from the JWT.
    """
    db_session.add(
        School(
            id=SCHOOL_UUID,
            slug="school-a",
            name="School A",
            academic_year="2025/2026",
            current_term=1,
        )
    )
    db_session.add(
        School(
            id=OTHER_SCHOOL_UUID,
            slug="school-b",
            name="School B (other tenant)",
            academic_year="2025/2026",
            current_term=2,
        )
    )
    await db_session.flush()

    # JWT scoped to A returns A. Never B.
    res_a = await client.get("/school", headers=auth_header(role="Admin", school_id=SCHOOL_UUID))
    assert res_a.status_code == 200
    assert res_a.json()["name"] == "School A"

    # JWT scoped to B returns B. Never A.
    res_b = await client.get(
        "/school", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res_b.status_code == 200
    assert res_b.json()["name"] == "School B (other tenant)"

    # The URL has no school_id parameter to tamper with — cross-scope
    # access on this endpoint is structurally impossible.


# ─── PATCH /school ───────────────────────────────────────────────────────────


async def test_patch_school_requires_admin(client: AsyncClient, seed_school: School) -> None:
    """Non-admin roles get 403 on PATCH, not 401."""
    for role in ("DeputyHead", "Teacher", "Parent", "Accountant"):
        res = await client.patch("/school", json={"motto": "Hi"}, headers=auth_header(role=role))
        assert res.status_code == 403, f"role={role} should be forbidden"


async def test_patch_school_applies_and_returns_updated(
    client: AsyncClient, seed_school: School
) -> None:
    res = await client.patch(
        "/school",
        json={"name": "UHAS Basic School (Renamed)", "motto": "New motto"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["name"] == "UHAS Basic School (Renamed)"
    assert body["motto"] == "New motto"


async def test_patch_school_writes_audit_row(
    client: AsyncClient, seed_school: School, db_session: AsyncSession
) -> None:
    res = await client.patch(
        "/school",
        json={"motto": "Audit me"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 200

    audit = (
        await db_session.execute(select(AuditLog).where(AuditLog.target_id == SCHOOL_UUID))
    ).scalar_one()
    assert audit.action == "SCHOOL_SETTINGS_UPDATE"
    assert audit.after is not None
    assert audit.after.get("motto") == "Audit me"


async def test_patch_school_rejects_unknown_fields(
    client: AsyncClient, seed_school: School
) -> None:
    """`model_config(extra='forbid')` — typos shouldn't silently no-op."""
    res = await client.patch(
        "/school",
        json={"name_typo": "X"},
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 422


async def test_patch_school_rejects_invalid_score_weights(
    client: AsyncClient, seed_school: School
) -> None:
    """scoreWeights validator rejects payloads that don't sum to 100."""
    res = await client.patch(
        "/school",
        json={
            "scoreWeights": {
                "exam": 50,
                "cat1": 10,
                "cat2": 10,
                "groupWork": 10,
                "projectWork": 10,  # sums to 90
            }
        },
        headers=auth_header(role="Admin"),
    )
    assert res.status_code == 422
    detail = res.json()
    assert "sum to 100" in str(detail).lower()
