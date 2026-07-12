"""Tests for the 2 leave-request email jobs — pure "send what I'm
told" handlers, no DB access, same coverage shape as
`appointments/tests/test_jobs.py`.
"""

from __future__ import annotations

import inngest
import pytest
from inngest.experimental import mocked

from app.features.leave_requests.jobs import LEAVE_REQUESTS_JOBS
from app.features.leave_requests.jobs.leave_decided_email import leave_decided_email_job
from app.features.leave_requests.jobs.leave_requested_email import leave_requested_email_job
from app.integrations.email.provider import EmailMessage, EmailResult

_client_mock = mocked.Inngest(app_id="test")

_FOOTER = {
    "school_name": "UHAS Basic School",
    "school_address": "Ho, Volta Region, Ghana",
    "school_contact_email": "info@uhas.edu.gh",
}


def test_jobs_are_registered() -> None:
    assert leave_requested_email_job in LEAVE_REQUESTS_JOBS
    assert leave_decided_email_job in LEAVE_REQUESTS_JOBS
    assert leave_requested_email_job.id == "uhas-sms-api-leave-requested-email"
    assert leave_decided_email_job.id == "uhas-sms-api-leave-decided-email"


def test_requested_job_sends_via_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[EmailMessage] = []

    class _FakeProvider:
        async def send(self, message: EmailMessage) -> EmailResult:
            sent.append(message)
            return EmailResult(success=True, skipped=False, error=None)

    monkeypatch.setattr(
        "app.features.leave_requests.jobs.leave_requested_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/leave-requested.requested",
        data={
            "approver_email": "deputy@uhas.edu.gh",
            "requester_name": "Ama Owusu",
            "leave_type": "Casual",
            "start_date": "2026-02-10",
            "end_date": "2026-02-12",
            "reason": "Family event",
            "link": "/deputy-head/leave",
            "preferences_link": "/deputy-head/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(leave_requested_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "deputy@uhas.edu.gh"
    assert "Ama Owusu" in sent[0].text
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
        "app.features.leave_requests.jobs.leave_decided_email.get_email_provider",
        lambda: _FakeProvider(),
    )

    event = inngest.Event(
        name="email/leave-decided.requested",
        data={
            "requester_email": "ama@uhas.edu.gh",
            "leave_type": "Casual",
            "start_date": "2026-02-10",
            "end_date": "2026-02-12",
            "action": "rejected",
            "rejection_reason": "Short-staffed that week",
            "link": "/teacher/leave",
            "preferences_link": "/teacher/profile?tab=notifications",
            **_FOOTER,
        },
    )
    res = mocked.trigger(leave_decided_email_job, event, _client_mock)
    assert res.status is mocked.Status.COMPLETED
    assert len(sent) == 1
    assert sent[0].to == "ama@uhas.edu.gh"
    assert sent[0].subject == "Leave request rejected"
    assert "Short-staffed" in sent[0].text
    assert sent[0].html is not None
