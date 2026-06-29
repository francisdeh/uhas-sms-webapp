"""Pydantic response models for the health feature."""

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Liveness response — the minimum a load balancer needs.

    Returned by `GET /health`. Keep this stable; deploy infra depends
    on the shape never breaking.
    """

    status: Literal["ok"] = Field(description="Always 'ok' when the process is serving.")
    service: str = Field(description="Human-readable service name.")
    version: str = Field(description="Package version from pyproject.toml.")
    env: str = Field(description="Deployment environment label.")
