"""Smoke test for the health endpoint."""

from fastapi.testclient import TestClient

from app.core.rate_limit import limiter
from app.features.health.router import get_health
from app.main import app


def test_health_is_exempt_from_rate_limiting() -> None:
    """Railway's liveness probe hits this constantly — it must never 429,
    unlike every other route which gets the global default limit."""
    name = f"{get_health.__module__}.{get_health.__name__}"
    assert name in limiter._exempt_routes  # no public API for this check

    client = TestClient(app)
    # A handful of rapid hits is enough to prove the decorator didn't
    # accidentally leave it subject to the default limit — 300 real
    # requests would just be slow, not more conclusive.
    for _ in range(5):
        assert client.get("/health").status_code == 200


def test_health_returns_ok() -> None:
    """GET /health must return 200 with the documented shape."""
    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"]  # non-empty
    assert body["version"]  # non-empty
    assert body["env"] in {"dev", "staging", "production", "test"}


def test_openapi_schema_is_served() -> None:
    """Drift check + frontend codegen rely on /openapi.json being live."""
    client = TestClient(app)
    response = client.get("/openapi.json")

    assert response.status_code == 200
    schema = response.json()
    assert "openapi" in schema
    assert "/health" in schema["paths"]
