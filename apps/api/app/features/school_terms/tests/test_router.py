"""HTTP-level tests for /school/terms endpoints.

Covers auth (401/403), happy path (GET + PUT round-trip), validator
behaviour (422 on bad date / wrong count / wrong term numbers), and
the cross-scope guarantee (terms returned are always scoped to the
caller's school_id from the JWT).
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.features.school_terms.tests.conftest import (
    OTHER_SCHOOL_UUID,
    SCHOOL_UUID,
    auth_header,
)
from app.features.schools.model import School

_VALID_PAYLOAD = {
    "academicYear": "2025/2026",
    "terms": [
        {"term": 1, "startDate": "2025-09-08", "endDate": "2025-12-19"},
        {"term": 2, "startDate": "2026-01-12", "endDate": "2026-04-03"},
        {"term": 3, "startDate": "2026-04-27", "endDate": "2026-07-31"},
    ],
}


# ─── GET /school/terms ───────────────────────────────────────────────────────


async def test_get_terms_requires_auth(client: AsyncClient) -> None:
    res = await client.get("/school/terms")
    assert res.status_code == 401


async def test_get_terms_empty_when_unconfigured(client: AsyncClient, seed_school: School) -> None:
    res = await client.get("/school/terms", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    assert res.json() == {"items": []}


async def test_get_terms_works_for_non_admin_roles(
    client: AsyncClient, seed_school: School
) -> None:
    """Reads are open to any role — terms drive report cards + dashboards."""
    for role in ("Admin", "DeputyHead", "Teacher", "Parent", "Accountant"):
        res = await client.get("/school/terms", headers=auth_header(role=role))
        assert res.status_code == 200, f"role={role} should read /school/terms"


# ─── PUT /school/terms ───────────────────────────────────────────────────────


async def test_put_terms_requires_admin(client: AsyncClient, seed_school: School) -> None:
    for role in ("DeputyHead", "Teacher", "Parent", "Accountant"):
        res = await client.put("/school/terms", json=_VALID_PAYLOAD, headers=auth_header(role=role))
        assert res.status_code == 403, f"role={role} should be forbidden"


async def test_put_terms_persists_and_returns_them(
    client: AsyncClient, seed_school: School
) -> None:
    res = await client.put("/school/terms", json=_VALID_PAYLOAD, headers=auth_header(role="Admin"))
    assert res.status_code == 200
    body = res.json()
    assert len(body["items"]) == 3
    assert [t["term"] for t in body["items"]] == [1, 2, 3]
    assert body["items"][0]["startDate"] == "2025-09-08"
    assert body["items"][0]["academicYear"] == "2025/2026"


async def test_put_terms_is_idempotent_round_trip(client: AsyncClient, seed_school: School) -> None:
    """PUT + GET round-trip returns the same rows in the same order."""
    await client.put("/school/terms", json=_VALID_PAYLOAD, headers=auth_header(role="Admin"))
    res = await client.get("/school/terms", headers=auth_header(role="Admin"))
    assert res.status_code == 200
    items = res.json()["items"]
    assert [t["term"] for t in items] == [1, 2, 3]


async def test_put_terms_rejects_wrong_term_count(client: AsyncClient, seed_school: School) -> None:
    bad = {**_VALID_PAYLOAD, "terms": _VALID_PAYLOAD["terms"][:2]}
    res = await client.put("/school/terms", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 422


async def test_put_terms_rejects_end_before_start(client: AsyncClient, seed_school: School) -> None:
    bad = {
        "academicYear": "2025/2026",
        "terms": [
            {"term": 1, "startDate": "2025-12-19", "endDate": "2025-09-08"},  # reversed
            {"term": 2, "startDate": "2026-01-12", "endDate": "2026-04-03"},
            {"term": 3, "startDate": "2026-04-27", "endDate": "2026-07-31"},
        ],
    }
    res = await client.put("/school/terms", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 422


async def test_put_terms_rejects_duplicate_term_number(
    client: AsyncClient, seed_school: School
) -> None:
    bad = {
        "academicYear": "2025/2026",
        "terms": [
            {"term": 1, "startDate": "2025-09-08", "endDate": "2025-12-19"},
            {"term": 1, "startDate": "2026-01-12", "endDate": "2026-04-03"},  # duplicate
            {"term": 3, "startDate": "2026-04-27", "endDate": "2026-07-31"},
        ],
    }
    res = await client.put("/school/terms", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 422


async def test_put_terms_rejects_bad_academic_year_format(
    client: AsyncClient, seed_school: School
) -> None:
    bad = {**_VALID_PAYLOAD, "academicYear": "2025-2026"}  # wrong separator
    res = await client.put("/school/terms", json=bad, headers=auth_header(role="Admin"))
    assert res.status_code == 422


# ─── Cross-scope guarantee ───────────────────────────────────────────────────


async def test_terms_response_scoped_to_jwt_school(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """A token scoped to school A never sees school B's terms.

    Each PUT writes terms under the JWT's school_id, and the GET filters
    by the same — even with two schools in the DB, neither can read or
    overwrite the other's rows.
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
            name="School B",
            academic_year="2025/2026",
            current_term=1,
        )
    )
    await db_session.flush()

    # School A admin upserts.
    res_a = await client.put(
        "/school/terms",
        json=_VALID_PAYLOAD,
        headers=auth_header(role="Admin", school_id=SCHOOL_UUID),
    )
    assert res_a.status_code == 200

    # School B admin GETs — empty, because the rows are A's.
    res_b = await client.get(
        "/school/terms", headers=auth_header(role="Admin", school_id=OTHER_SCHOOL_UUID)
    )
    assert res_b.status_code == 200
    assert res_b.json()["items"] == []
