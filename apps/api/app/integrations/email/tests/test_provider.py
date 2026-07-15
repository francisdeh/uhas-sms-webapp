"""Tests for the email integration.

`SmtpEmailProvider`'s real network send isn't covered here — same
convention as `RealStorageClient`/`RealSupabaseAdminClient`: CI has no
mail server to send against. What's covered: the not-configured
provider's "skip, don't fail" contract (the load-bearing behaviour
ported from the TS side), the factory's config-based resolution,
`BrevoEmailProvider`'s request/response contract (mocked with `respx`
— no live Brevo account to send against, same posture as the SMS
providers' tests), and `app_url`.
"""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.core.config import settings
from app.integrations.email.provider import (
    BrevoEmailProvider,
    EmailMessage,
    SmtpEmailProvider,
    _NotConfiguredEmailProvider,
    app_url,
    get_email_provider,
)

_BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"


async def test_not_configured_provider_skips_instead_of_failing() -> None:
    provider = _NotConfiguredEmailProvider()
    result = await provider.send(
        EmailMessage(to="teacher@example.com", subject="Test", text="Body")
    )
    assert result.success is True
    assert result.skipped is True
    assert result.error is None


def test_factory_returns_not_configured_when_nothing_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "brevo_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), _NotConfiguredEmailProvider)


def test_factory_returns_smtp_provider_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "brevo_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_user", "school@gmail.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    assert isinstance(get_email_provider(), SmtpEmailProvider)


def test_factory_returns_smtp_provider_for_mailpit_with_no_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mailpit needs no auth — host alone is enough to use SMTP."""
    monkeypatch.setattr(settings, "brevo_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), SmtpEmailProvider)


def test_factory_returns_brevo_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "brevo_api_key", "xkeysib-test")
    monkeypatch.setattr(settings, "smtp_host", None)
    assert isinstance(get_email_provider(), BrevoEmailProvider)


def test_factory_prefers_brevo_over_smtp_when_both_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "brevo_api_key", "xkeysib-test")
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), BrevoEmailProvider)


@respx.mock
async def test_brevo_provider_success_on_2xx() -> None:
    respx.post(_BREVO_SEND_URL).mock(
        return_value=httpx.Response(201, json={"messageId": "brevo-msg-1"})
    )
    provider = BrevoEmailProvider(
        api_key="xkeysib-test", sender_email="no-reply@uhas.edu.gh", sender_name="UHAS SMS"
    )
    result = await provider.send(
        EmailMessage(to="parent@example.com", subject="Test", text="Body", html="<p>Body</p>")
    )
    assert result.success is True
    assert result.error is None


@respx.mock
async def test_brevo_provider_failed_on_http_error() -> None:
    respx.post(_BREVO_SEND_URL).mock(return_value=httpx.Response(401, json={"message": "bad key"}))
    provider = BrevoEmailProvider(
        api_key="bad-key", sender_email="no-reply@uhas.edu.gh", sender_name="UHAS SMS"
    )
    result = await provider.send(EmailMessage(to="parent@example.com", subject="Test", text="Body"))
    assert result.success is False
    assert result.error is not None


@respx.mock
async def test_brevo_provider_sends_expected_request_shape() -> None:
    route = respx.post(_BREVO_SEND_URL).mock(
        return_value=httpx.Response(201, json={"messageId": "brevo-msg-2"})
    )
    provider = BrevoEmailProvider(
        api_key="xkeysib-test", sender_email="no-reply@uhas.edu.gh", sender_name="UHAS SMS"
    )
    await provider.send(
        EmailMessage(to="parent@example.com", subject="Hello", text="Plain body", html="<b>Hi</b>")
    )

    request = route.calls.last.request
    assert request.headers["api-key"] == "xkeysib-test"
    body = json.loads(request.content)
    assert body["sender"] == {"name": "UHAS SMS", "email": "no-reply@uhas.edu.gh"}
    assert body["to"] == [{"email": "parent@example.com"}]
    assert body["subject"] == "Hello"
    assert body["textContent"] == "Plain body"
    assert body["htmlContent"] == "<b>Hi</b>"


def test_app_url_joins_base_and_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://uhas-sms.example.com")
    assert (
        app_url("/teacher/lesson-plans/abc")
        == "https://uhas-sms.example.com/teacher/lesson-plans/abc"
    )
    assert (
        app_url("teacher/lesson-plans/abc")
        == "https://uhas-sms.example.com/teacher/lesson-plans/abc"
    )


def test_app_url_strips_trailing_slash_on_base(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "app_url", "https://uhas-sms.example.com/")
    assert app_url("/x") == "https://uhas-sms.example.com/x"
