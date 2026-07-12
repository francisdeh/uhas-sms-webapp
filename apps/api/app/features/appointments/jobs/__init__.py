"""Registers every Inngest function in the appointments domain."""

from __future__ import annotations

from app.features.appointments.jobs.appointment_cancelled_email import (
    appointment_cancelled_email_job,
)
from app.features.appointments.jobs.appointment_decided_email import appointment_decided_email_job
from app.features.appointments.jobs.appointment_requested_email import (
    appointment_requested_email_job,
)

APPOINTMENTS_JOBS = [
    appointment_requested_email_job,
    appointment_decided_email_job,
    appointment_cancelled_email_job,
]
