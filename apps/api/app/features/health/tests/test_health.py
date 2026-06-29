"""Smoke test for the health endpoint."""

from fastapi.testclient import TestClient

from app.main import app


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
