"""Registers every Inngest function in the reports domain."""

from __future__ import annotations

from app.features.reports.jobs.report_batch import report_batch_job
from app.features.reports.jobs.report_generate import report_generate_job

REPORTS_JOBS = [report_generate_job, report_batch_job]
