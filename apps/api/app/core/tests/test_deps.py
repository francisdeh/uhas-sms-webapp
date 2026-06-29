"""HTTP-level tests for the auth dependencies.

Builds a throwaway FastAPI app with three protected endpoints and
exercises them via TestClient + minted JWTs.
"""

from __future__ import annotations

import time
from typing import Annotated

import jwt
import pytest
from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.deps import (
    CurrentSchoolIdDep,
    CurrentUserDep,
    assert_same_school,
    require_role,
)
from app.core.errors import AppError
from app.core.security import CurrentUser


def _mint(
    role: str | None = "Teacher",
    expires_in: int = 3600,
    school_id: str | None = "school-uhas-001",
) -> str:
    now = int(time.time())
    app_metadata: dict[str, object] = {"role": role, "linked_id": "STAFF-001"}
    if school_id is not None:
        app_metadata["school_id"] = school_id
    return jwt.encode(
        {
            "sub": "user-uuid-here",
            "iat": now,
            "exp": now + expires_in,
            "email": "x@example.com",
            "app_metadata": app_metadata,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )


@pytest.fixture
def client() -> TestClient:
    """Mini FastAPI app with three endpoints — covers every dep path."""
    app = FastAPI()

    # Real production maps `AppError → JSON envelope`; mirror that here
    # so the tests assert against the same shape callers see.
    @app.exception_handler(AppError)
    async def app_error_handler(_, exc):  # type: ignore[no-untyped-def]
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )

    @app.get("/who")
    def who(user: CurrentUserDep) -> dict[str, str | None]:
        return {"user_id": user.user_id, "role": user.role}

    @app.get("/admin-only")
    def admin_only(
        _user: Annotated[CurrentUser, Depends(require_role("Admin"))],
    ) -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/admin-or-dh")
    def admin_or_dh(
        _user: Annotated[CurrentUser, Depends(require_role("Admin", "DeputyHead"))],
    ) -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/my-school")
    def my_school(school_id: CurrentSchoolIdDep) -> dict[str, str]:
        return {"school_id": school_id}

    @app.get("/schools/{school_id}/things")
    def school_scoped(
        school_id: str,
        current_school_id: CurrentSchoolIdDep,
    ) -> dict[str, str]:
        assert_same_school(school_id, current_school_id)
        return {"school_id": school_id}

    return TestClient(app)


def test_missing_authorization_header_is_401(client: TestClient) -> None:
    res = client.get("/who")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "unauthorized"


def test_malformed_authorization_header_is_401(client: TestClient) -> None:
    res = client.get("/who", headers={"Authorization": "Token whatever"})
    assert res.status_code == 401


def test_valid_token_resolves_user(client: TestClient) -> None:
    res = client.get("/who", headers={"Authorization": f"Bearer {_mint('Teacher')}"})
    assert res.status_code == 200
    assert res.json() == {"user_id": "user-uuid-here", "role": "Teacher"}


def test_expired_token_is_401(client: TestClient) -> None:
    res = client.get("/who", headers={"Authorization": f"Bearer {_mint('Teacher', expires_in=-1)}"})
    assert res.status_code == 401


def test_role_match_allows_through(client: TestClient) -> None:
    res = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {_mint('Admin')}"},
    )
    assert res.status_code == 200


def test_role_mismatch_is_403_not_401(client: TestClient) -> None:
    """Distinct codes — 401 = not authenticated, 403 = authenticated but wrong role."""
    res = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {_mint('Teacher')}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_require_role_accepts_any_of_listed(client: TestClient) -> None:
    """`require_role('Admin', 'DeputyHead')` lets either through."""
    for role in ("Admin", "DeputyHead"):
        res = client.get(
            "/admin-or-dh",
            headers={"Authorization": f"Bearer {_mint(role)}"},
        )
        assert res.status_code == 200, f"role={role} should pass"

    res = client.get(
        "/admin-or-dh",
        headers={"Authorization": f"Bearer {_mint('Parent')}"},
    )
    assert res.status_code == 403


# ─── School-scope deps ───────────────────────────────────────────────────────


def test_school_id_resolves_from_jwt_app_metadata(client: TestClient) -> None:
    """`get_current_school_id` reads from app_metadata, not user_metadata."""
    res = client.get(
        "/my-school",
        headers={"Authorization": f"Bearer {_mint(school_id='school-uhas-001')}"},
    )
    assert res.status_code == 200
    assert res.json() == {"school_id": "school-uhas-001"}


def test_missing_school_id_claim_is_403(client: TestClient) -> None:
    """A valid JWT with no school_id claim → 403, not 200 or 500."""
    res = client.get(
        "/my-school",
        headers={"Authorization": f"Bearer {_mint(school_id=None)}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"


def test_same_school_passes_assert(client: TestClient) -> None:
    """Path school_id matches JWT claim → through."""
    res = client.get(
        "/schools/school-uhas-001/things",
        headers={"Authorization": f"Bearer {_mint(school_id='school-uhas-001')}"},
    )
    assert res.status_code == 200


def test_cross_school_access_is_403(client: TestClient) -> None:
    """Attempted access to a different school's data → 403.

    This is the test the migration plan's 'done when' clause requires:
    a JWT scoped to school A cannot reach school B's resources, even
    when the URL says otherwise.
    """
    res = client.get(
        "/schools/school-other-002/things",
        headers={"Authorization": f"Bearer {_mint(school_id='school-uhas-001')}"},
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"
