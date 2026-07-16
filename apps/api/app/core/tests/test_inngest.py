"""Proves the Inngest runner is wired end-to-end.

Doesn't exercise real step execution (that means faking Inngest's
internal `Context`/`MiddlewareManager` machinery, which tests the SDK,
not our code) — instead asserts the webhook route mounts, dev mode is
active with zero config, and the health-ping job is registered.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.inngest import inngest_client
from app.features.announcements.jobs import ANNOUNCEMENTS_JOBS
from app.features.appointments.jobs import APPOINTMENTS_JOBS
from app.features.assignments.jobs import ASSIGNMENTS_JOBS
from app.features.attendance.jobs import ATTENDANCE_JOBS
from app.features.exams.jobs import EXAMS_JOBS
from app.features.fees.jobs import FEES_JOBS
from app.features.health.jobs import HEALTH_JOBS
from app.features.health.jobs.ping import ping_job
from app.features.leave_requests.jobs import LEAVE_REQUESTS_JOBS
from app.features.lesson_plans.jobs import LESSON_PLANS_JOBS
from app.features.promotions.jobs import PROMOTIONS_JOBS
from app.features.schemes.jobs import SCHEMES_JOBS
from app.features.sms.jobs import SMS_JOBS
from app.features.users.jobs import USERS_JOBS
from app.main import app

client = TestClient(app)

_ALL_JOBS = [
    *HEALTH_JOBS,
    *SMS_JOBS,
    *LESSON_PLANS_JOBS,
    *EXAMS_JOBS,
    *FEES_JOBS,
    *APPOINTMENTS_JOBS,
    *LEAVE_REQUESTS_JOBS,
    *ATTENDANCE_JOBS,
    *USERS_JOBS,
    *PROMOTIONS_JOBS,
    *ASSIGNMENTS_JOBS,
    *SCHEMES_JOBS,
    *ANNOUNCEMENTS_JOBS,
]


def test_inngest_webhook_route_is_mounted() -> None:
    r = client.get("/api/inngest")
    assert r.status_code == 200
    body = r.json()
    assert body["function_count"] == len(_ALL_JOBS)
    assert body["mode"] == "dev"


def test_client_runs_in_dev_mode_without_credentials() -> None:
    # Test settings never set INNGEST_EVENT_KEY/SIGNING_KEY — dev mode
    # must not require them.
    assert inngest_client.is_production is False


def test_ping_job_is_registered() -> None:
    assert ping_job in HEALTH_JOBS
    assert ping_job.id == "uhas-sms-api-health-ping"
