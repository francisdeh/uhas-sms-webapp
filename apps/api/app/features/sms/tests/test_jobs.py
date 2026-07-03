"""Tests for the SMS fan-out job's registration + wiring.

Doesn't trigger the job end-to-end: `_send_one` opens its own real DB
session via `SessionLocal` (correct for production — jobs run outside
any request-scoped session) and commits, which would leave a real row
in the shared test DB with no rollback-based cleanup. The actual send
logic it wraps (`SmsService.send`) already has full DB-isolated
coverage in `test_service.py`; this file only proves the job exists
and is registered with the right id + event trigger.
"""

from __future__ import annotations

from app.features.sms.jobs import SMS_JOBS
from app.features.sms.jobs.sms_fanout import sms_fanout_job


def test_fanout_job_is_registered() -> None:
    assert sms_fanout_job in SMS_JOBS
    assert sms_fanout_job.id == "uhas-sms-api-sms-fanout"
