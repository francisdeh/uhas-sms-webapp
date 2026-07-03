"""Provider-agnostic outbound email — ports the pre-migration Next-side
`lib/email.ts` 1:1, including its "missing config is not an error"
contract: `get_email_provider()` never raises for a missing SMTP
setup, it returns a provider that logs and reports `skipped=True` so
every environment (dev, CI, tests) runs the same code path.

Swapping to a transactional provider (Resend/SendGrid/Postmark) later
is a new class + a one-line change in `get_email_provider()` — no
caller changes.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailMessage:
    __slots__ = ("html", "subject", "text", "to")

    def __init__(self, *, to: str, subject: str, text: str, html: str | None = None) -> None:
        self.to = to
        self.subject = subject
        self.text = text
        self.html = html


class EmailResult:
    __slots__ = ("error", "skipped", "success")

    def __init__(self, *, success: bool, skipped: bool = False, error: str | None = None) -> None:
        self.success = success
        self.skipped = skipped
        self.error = error


class EmailProvider(Protocol):
    async def send(self, msg: EmailMessage) -> EmailResult: ...


class _NotConfiguredEmailProvider:
    """SMTP isn't set up. Logs a warning and reports success-but-skipped
    — matching the TS behaviour exactly. A missing mail server is an
    expected state (most dev/CI environments), not a failure."""

    async def send(self, msg: EmailMessage) -> EmailResult:
        logger.warning(
            "[email] SMTP not configured — would have sent to %s: %s", msg.to, msg.subject
        )
        return EmailResult(success=True, skipped=True)


class SmtpEmailProvider:
    """`smtplib` is blocking; every call runs in a thread via
    `asyncio.to_thread` to keep the event loop free — same pattern as
    `RealStorageClient` / `RealSupabaseAdminClient`."""

    def __init__(self, *, host: str, port: int, user: str, password: str) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password

    async def send(self, msg: EmailMessage) -> EmailResult:
        dev_redirect = settings.env != "production" and settings.email_dev_redirect
        to = dev_redirect or msg.to
        subject = f"[dev → {msg.to}] {msg.subject}" if dev_redirect else msg.subject
        from_addr = settings.email_from or f"UHAS SMS <{self._user}>"

        def _send() -> None:
            mime = MIMEMultipart("alternative")
            mime["From"] = from_addr
            mime["To"] = to
            mime["Subject"] = subject
            mime.attach(MIMEText(msg.text, "plain"))
            if msg.html:
                mime.attach(MIMEText(msg.html, "html"))

            # Port 465 → implicit TLS from connection open; anything else
            # (587 etc.) → plaintext connect + STARTTLS upgrade.
            if self._port == 465:
                with smtplib.SMTP_SSL(self._host, self._port) as smtp:
                    smtp.login(self._user, self._password)
                    smtp.send_message(mime)
            else:
                with smtplib.SMTP(self._host, self._port) as smtp:
                    smtp.starttls()
                    smtp.login(self._user, self._password)
                    smtp.send_message(mime)

        try:
            await asyncio.to_thread(_send)
            return EmailResult(success=True)
        except Exception as exc:
            logger.error("[email] send to %s failed: %s", msg.to, exc)
            return EmailResult(success=False, error=str(exc))


def get_email_provider() -> EmailProvider:
    if settings.smtp_host and settings.smtp_user and settings.smtp_password:
        return SmtpEmailProvider(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_password,
        )
    return _NotConfiguredEmailProvider()


def app_url(pathname: str) -> str:
    """Build a fully-qualified URL to a route in the Next.js app."""
    base = settings.app_url.rstrip("/")
    path = pathname if pathname.startswith("/") else f"/{pathname}"
    return f"{base}{path}"
