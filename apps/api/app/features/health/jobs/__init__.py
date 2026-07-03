"""Registers every Inngest function in the health domain.

`main.py` imports `HEALTH_JOBS` and folds it into the flat list passed
to `inngest.fast_api.serve(...)` — that's the only place this needs to
be wired.
"""

from __future__ import annotations

from app.features.health.jobs.ping import ping_job

HEALTH_JOBS = [ping_job]
