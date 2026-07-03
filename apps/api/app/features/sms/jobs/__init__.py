"""Registers every Inngest function in the SMS domain."""

from __future__ import annotations

from app.features.sms.jobs.sms_fanout import sms_fanout_job

SMS_JOBS = [sms_fanout_job]
