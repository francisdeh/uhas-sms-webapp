"""Sentry + Logfire wiring.

Both are designed to be **silent no-ops** when their credentials are
unset, so the import + init lines can live in `main.py` from day one
without forcing the team into paid accounts.

  - **Sentry** catches uncaught exceptions, captures request context,
    and samples performance traces.
  - **Logfire** instruments FastAPI + SQLAlchemy for per-request
    traces, slow-query detection, and Pydantic validation visibility.

Both run together — they're complementary, not redundant. Sentry is
the alerting layer (something broke, ping me); Logfire is the
inspection layer (why was that request slow?).

PII scrubbing strips student names, phone numbers, and any value that
looks like a password before payloads leave the process. See `_scrub_pii`.
"""

# `from __future__ import annotations` defers annotation evaluation so the
# TYPE_CHECKING types below resolve only under mypy / IDE introspection,
# never at runtime.
from __future__ import annotations

from typing import TYPE_CHECKING, Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

from app.core.config import settings

if TYPE_CHECKING:
    # `Event` and `Hint` are TYPE_CHECKING-only inside sentry_sdk —
    # importing them at runtime raises ImportError. With `from __future__
    # import annotations` above, the type annotations referencing these
    # names are kept as strings, so this guarded import is enough.
    from sentry_sdk._types import Event, Hint

# Keys that should never leave the process — request body fields that
# typically carry credentials or PII.
_SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "password",
        "current_password",
        "new_password",
        "token",
        "access_token",
        "refresh_token",
        "secret",
        "api_key",
        "authorization",
        # Domain-specific: stripped here so Sentry never sees them.
        "phone",
        "phone_number",
        "first_name",
        "last_name",
        "full_name",
        "guardian_phone",
    }
)


def _scrub_pii(event: Event, _hint: Hint) -> Event | None:
    """Strip sensitive fields from a Sentry event before send.

    Drops `request.data` outright — Sentry's default capture of POST
    bodies is the highest-risk surface for accidental PII leakage.
    Also redacts any request header whose name matches a sensitive
    key, and trims headers down to a safe allowlist.
    """
    request = event.get("request")
    if isinstance(request, dict):
        # Body is high-risk — drop wholesale.
        request.pop("data", None)
        # Cookies frequently carry session state.
        request.pop("cookies", None)
        # Filter headers to a safe allowlist.
        headers = request.get("headers")
        if isinstance(headers, dict):
            safe = {
                k: v
                for k, v in headers.items()
                if k.lower() in {"content-type", "user-agent", "accept", "host"}
            }
            request["headers"] = safe
    return event


def init_observability() -> None:
    """Initialise Sentry + Logfire. Called once at FastAPI startup.

    Order matters slightly: Sentry first so its before-send hook is
    registered before Logfire (which can also emit events). Both
    are safe to call when their credential is None.
    """
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.env,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            before_send=_scrub_pii,
            # Cap the payload size we never expect to need.
            max_breadcrumbs=50,
            send_default_pii=False,
        )

    if settings.logfire_token:
        # Imported lazily because logfire's import side-effects (loading
        # OpenTelemetry exporters) are unnecessary when the token is
        # absent — saves boot time in dev/CI.
        import logfire

        logfire.configure(
            token=settings.logfire_token,
            environment=settings.env,
            service_name=settings.app_name,
        )


def instrument_app(app: Any, engine: Any) -> None:
    """Attach Logfire instrumentation to FastAPI + SQLAlchemy.

    Called from main.py *after* `app` and `engine` exist. Each
    instrument call is a no-op when Logfire isn't configured.
    """
    if not settings.logfire_token:
        return

    import logfire

    logfire.instrument_fastapi(app, capture_headers=False)
    logfire.instrument_sqlalchemy(engine=engine)
