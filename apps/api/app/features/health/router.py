"""Health endpoint — proves the process is serving and configured."""

from importlib.metadata import PackageNotFoundError, version

from fastapi import APIRouter

from app.core.config import settings
from app.features.health.schema import HealthResponse

router = APIRouter(tags=["health"])


def _package_version() -> str:
    """Read the version from package metadata; fall back to pyproject literal.

    `uv sync` installs the project as editable, which makes the
    metadata available. If the package isn't installed (e.g. running
    ad-hoc with `python -m`), return a sentinel.
    """
    try:
        return version("uhas-sms-api")
    except PackageNotFoundError:
        return "0.0.0-dev"


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Liveness check",
    description="Returns 200 when the process is up. Used by Railway + load-balancer probes.",
)
def get_health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=_package_version(),
        env=settings.env,
    )
