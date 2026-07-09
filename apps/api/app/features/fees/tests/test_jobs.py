"""Tests for the fee-reminder job's registration + wiring.

Doesn't trigger the job end-to-end: `_remind_one_school` opens its own
real DB session via `SessionLocal` (correct for production — jobs run
outside any request-scoped session) and commits, which would leave
real rows in the shared test DB with no rollback-based cleanup. The
actual reminder logic it wraps (`FeesService.send_overdue_reminders`)
already has full DB-isolated coverage in `test_reminders.py`; this file
only proves the job exists, is registered, and is cron- (not event-)
triggered — same convention as `sms/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest

from app.features.fees.jobs import FEES_JOBS
from app.features.fees.jobs.fee_reminder import fee_reminder_job


def test_fee_reminder_job_is_registered() -> None:
    assert fee_reminder_job in FEES_JOBS
    assert fee_reminder_job.id == "uhas-sms-api-fee-reminder-weekly"


def test_fee_reminder_job_is_cron_triggered_weekly() -> None:
    triggers = fee_reminder_job.get_config("http://localhost:8000").main.triggers
    assert len(triggers) == 1
    assert isinstance(triggers[0], inngest.TriggerCron)
    assert triggers[0].cron == "0 7 * * 1"
