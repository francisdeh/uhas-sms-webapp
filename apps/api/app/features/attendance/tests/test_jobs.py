"""Tests for the attendance-absence email job — pure "send what I'm
told" handler, no DB access, same coverage shape as
`leave_requests/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.attendance.jobs import ATTENDANCE_JOBS
from app.features.attendance.jobs.attendance_absent_email import attendance_absent_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_job_is_registered() -> None:
    assert attendance_absent_email_job in ATTENDANCE_JOBS
    assert attendance_absent_email_job.id == "uhas-sms-api-attendance-absent-email"


def test_job_sends_via_provider_singular(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.attendance.jobs.attendance_absent_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/attendance-absent.requested",
        data={
            "guardian_email": "efua@uhas.edu.gh",
            "student_names": "Kojo Boateng",
            "was_were": "was",
            "date": "2026-01-15",
            "link": "/parent/attendance",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(attendance_absent_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "efua@uhas.edu.gh"
    assert sent[0].subject == "Attendance: Kojo Boateng marked absent"
    assert "was marked absent" in sent[0].text
    assert sent[0].html is not None
    assert "UHAS Basic School" in sent[0].html


def test_job_sends_via_provider_plural(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.attendance.jobs.attendance_absent_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/attendance-absent.requested",
        data={
            "guardian_email": "efua@uhas.edu.gh",
            "student_names": "Akua Mensah and Kojo Boateng",
            "was_were": "were",
            "date": "2026-01-15",
            "link": "/parent/attendance",
            "preferences_link": "/parent/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(attendance_absent_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert "were marked absent" in sent[0].text
