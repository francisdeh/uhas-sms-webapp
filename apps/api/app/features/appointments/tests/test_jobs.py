"""Tests for the 3 appointment email jobs — pure "send what I'm told"
handlers, no DB access, same coverage shape as
`lesson_plans/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.appointments.jobs import APPOINTMENTS_JOBS
from app.features.appointments.jobs.appointment_cancelled_email import (
    appointment_cancelled_email_job,
)
from app.features.appointments.jobs.appointment_decided_email import appointment_decided_email_job
from app.features.appointments.jobs.appointment_requested_email import (
    appointment_requested_email_job,
)
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_jobs_are_registered() -> None:
    assert appointment_requested_email_job in APPOINTMENTS_JOBS
    assert appointment_decided_email_job in APPOINTMENTS_JOBS
    assert appointment_cancelled_email_job in APPOINTMENTS_JOBS
    assert appointment_requested_email_job.id == "uhas-sms-api-appointment-requested-email"
    assert appointment_decided_email_job.id == "uhas-sms-api-appointment-decided-email"
    assert appointment_cancelled_email_job.id == "uhas-sms-api-appointment-cancelled-email"


def test_requested_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.appointments.jobs.appointment_requested_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/appointment-requested.requested",
        data={
            "teacher_email": "ama@uhas.edu.gh",
            "teacher_name": "Ama Teacher",
            "guardian_name": "Efua Guardian",
            "student_name": "Kofi",
            "reason": "Progress check-in",
            "link": "/teacher/appointments",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(appointment_requested_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "ama@uhas.edu.gh"
    assert "Efua Guardian" in sent[0].text
    assert sent[0].html is not None
    assert "UHAS Basic School" in sent[0].html
    assert "Manage email preferences" in sent[0].html


def test_decided_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.appointments.jobs.appointment_decided_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/appointment-decided.requested",
        data={
            "guardian_email": "efua@example.com",
            "teacher_name": "Ama Teacher",
            "student_name": "Kofi",
            "action": "confirmed",
            "response": "See you Thursday.",
            "link": "/parent/appointments",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(appointment_decided_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "efua@example.com"
    assert sent[0].subject == "Appointment confirmed"
    assert sent[0].html is not None


def test_cancelled_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.appointments.jobs.appointment_cancelled_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/appointment-cancelled.requested",
        data={
            "teacher_email": "ama@uhas.edu.gh",
            "teacher_name": "Ama Teacher",
            "guardian_name": "Efua Guardian",
            "student_name": "Kofi",
            "link": "/teacher/appointments",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(appointment_cancelled_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "ama@uhas.edu.gh"
    assert "Efua Guardian" in sent[0].text
