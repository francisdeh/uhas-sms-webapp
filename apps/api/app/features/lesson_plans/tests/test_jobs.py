"""Tests for the lesson-plan-rejection email job.

Unlike the SMS fan-out job, this one never touches the DB (it only
formats text and calls the email provider), so it's safe to run
end-to-end via the SDK's own `mocked.trigger` test harness — no
DB-pollution risk. Uses plain `def` (not `async def`): `mocked.trigger`
manages its own event loop internally and conflicts with one already
running, matching the SDK's own test suite convention.
"""

from __future__ import annotations

import inngest
from inngest.experimental import mocked

from app.features.lesson_plans.jobs import LESSON_PLANS_JOBS
from app.features.lesson_plans.jobs.rejection_email import rejection_email_job

_client_mock = mocked.Inngest(app_id="test")


def test_job_is_registered() -> None:
    assert rejection_email_job in LESSON_PLANS_JOBS
    assert rejection_email_job.id == "uhas-sms-api-lesson-plan-rejection-email"


def test_job_completes_and_reports_skipped_without_smtp_config() -> None:
    """No SMTP env vars in the test process — proves the job doesn't
    crash when the not-configured email provider is in play."""
    event = inngest.Event(
        name="email/lesson-plan-rejected.requested",
        data={
            "teacher_email": "ama@uhas.edu.gh",
            "plan_topic": "Fractions",
            "reviewer_name": "Kojo Head",
            "comment": "Add more resources.",
            "link": "/teacher/lesson-plans/abc123",
        },
    )
    res = mocked.trigger(rejection_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert res.output == {"success": True, "skipped": True, "error": None}


def test_job_handles_missing_comment() -> None:
    event = inngest.Event(
        name="email/lesson-plan-rejected.requested",
        data={
            "teacher_email": "ama@uhas.edu.gh",
            "plan_topic": "Fractions",
            "reviewer_name": "Kojo Head",
            "comment": None,
            "link": "/teacher/lesson-plans/abc123",
        },
    )
    res = mocked.trigger(rejection_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert res.output == {"success": True, "skipped": True, "error": None}
