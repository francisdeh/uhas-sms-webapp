"""Tests for the email integration.

`SmtpEmailProvider`'s real network send isn't covered here — same
convention as `RealStorageClient`/`RealSupabaseAdminClient`: CI has no
mail server to send against. What's covered: the not-configured
provider's "skip, don't fail" contract (the load-bearing behaviour
ported from the TS side), the factory's config-based resolution, and
`app_url`.
"""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.integrations.email.provider import (
    EmailMessage,
    ResendEmailProvider,
    SmtpEmailProvider,
    _NotConfiguredEmailProvider,
    app_url,
    get_email_provider,
)


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
    monkeypatch.setattr(settings, "resend_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", None)
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), _NotConfiguredEmailProvider)


def test_factory_returns_smtp_provider_when_fully_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_user", "school@gmail.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    assert isinstance(get_email_provider(), SmtpEmailProvider)


def test_factory_returns_smtp_provider_for_mailpit_with_no_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mailpit needs no auth — host alone is enough to use SMTP."""
    monkeypatch.setattr(settings, "resend_api_key", None)
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), SmtpEmailProvider)


def test_factory_returns_resend_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "smtp_host", None)
    assert isinstance(get_email_provider(), ResendEmailProvider)


def test_factory_prefers_resend_over_smtp_when_both_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "resend_api_key", "re_test_key")
    monkeypatch.setattr(settings, "smtp_host", "localhost")
    monkeypatch.setattr(settings, "smtp_user", None)
    monkeypatch.setattr(settings, "smtp_password", None)
    assert isinstance(get_email_provider(), ResendEmailProvider)


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
