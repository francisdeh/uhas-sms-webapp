"""Application settings — loaded from environment variables.

Uses pydantic-settings so values are validated at startup. A missing
required setting fails the boot rather than surfacing as a runtime error
mid-request.

Add new settings to the Settings class only. Read them through `settings`
(the cached singleton at the bottom of this file) — never via
`os.environ` directly.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the FastAPI service."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App identity ──────────────────────────────────────────────────────
    app_name: str = "UHAS SMS API"
    env: Literal["dev", "staging", "production", "test"] = Field(
        default="dev",
        description="Deployment environment — drives logging level + CORS posture.",
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    # The Next.js frontend's origin. In prod this is the Railway web
    # service URL; locally it's http://localhost:3000.
    cors_allow_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000"],
        description="Allowed origins for the Next.js client. CSV-friendly in .env.",
    )

    # ── Database ──────────────────────────────────────────────────────────
    # Driver URL for SQLAlchemy + asyncpg. In local dev this points at
    # the Supabase CLI's Postgres (port 54322); in prod, Supabase's
    # pooler URL. Format: postgresql+asyncpg://user:pass@host:port/db
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:54322/postgres",
        description="SQLAlchemy async DSN. Set via DATABASE_URL env var.",
    )
    database_echo: bool = Field(
        default=False,
        description="Log every SQL statement. Useful in dev; never in prod.",
    )

    # ── Observability ─────────────────────────────────────────────────────
    # Both SDKs are no-ops when their credentials are unset. Set the
    # values on Railway when you create the Sentry project + Logfire
    # workspace; no code change needed.
    sentry_dsn: str | None = Field(
        default=None,
        description="Sentry project DSN. Empty = SDK disabled.",
    )
    sentry_traces_sample_rate: float = Field(
        default=0.2,
        ge=0.0,
        le=1.0,
        description="Fraction of transactions sent for performance monitoring.",
    )
    logfire_token: str | None = Field(
        default=None,
        description="Logfire write token. Empty = local stdout only, no upload.",
    )

    # ── Rate limiting ─────────────────────────────────────────────────────
    # Empty = in-memory counters (correct for a single instance — the
    # only thing this API runs as today). Set to a real Redis URL before
    # ever scaling apps/api to more than one Railway replica, or each
    # replica would enforce the limit independently, multiplying the
    # effective cap by the replica count.
    redis_url: str | None = Field(
        default=None,
        description="redis://... for rate-limit storage. Empty = in-memory (single instance only).",
    )

    # ── Supabase Auth ─────────────────────────────────────────────────────
    # `supabase_url` is the public REST endpoint; `supabase_jwt_secret` is
    # what verifies inbound JWTs (HS256 algorithm — the Supabase default).
    # `supabase_service_role_key` is the server-side admin key, used by
    # the seed script and trusted backend operations only — NEVER exposed
    # to the client.
    #
    # Defaults point at the local Supabase CLI stack so the API works
    # out-of-the-box against `supabase start` without any env config.
    supabase_url: str = Field(
        default="http://127.0.0.1:54321",
        description="Supabase project REST URL.",
    )
    supabase_jwt_secret: str = Field(
        default="super-secret-jwt-token-with-at-least-32-characters-long",
        description=(
            "HS256 secret used to verify Supabase-issued JWTs. "
            "The default matches the local Supabase CLI; override in prod."
        ),
    )
    supabase_anon_key: str | None = Field(
        default=None,
        description="Public anon key. Not used server-side; documented for parity.",
    )
    supabase_service_role_key: str | None = Field(
        default=None,
        description="Server-side admin key. Required by the seed script + RLS-bypass ops.",
    )

    # ── Background jobs (Inngest) ─────────────────────────────────────────
    # `INNGEST_DEV=true` is read directly from the process env by the SDK
    # itself (not through this Settings class) — it switches the client
    # into dev mode, which talks to a local `inngest dev` server instead
    # of Inngest Cloud and needs no event/signing keys. Set it in `.env`
    # for local dev and CI; leave unset in production.
    inngest_event_key: str | None = Field(
        default=None,
        description="Inngest Cloud event key. Unused in dev mode.",
    )
    inngest_signing_key: str | None = Field(
        default=None,
        description="Inngest Cloud signing key. Verifies inbound calls. Unused in dev mode.",
    )

    # ── Outbound email ────────────────────────────────────────────────────
    # Provider-agnostic — `get_email_provider()` prefers Brevo (real
    # production sends) when `brevo_api_key` is set, else falls back to
    # plain SMTP (local Mailpit in dev — no credentials needed — or a
    # real SMTP server if `smtp_user`/`smtp_password` are also set), else
    # the not-configured stub that logs + returns `skipped=True` so every
    # environment (dev, CI, tests) runs the same code path without
    # exploding. Same "missing config isn't an error" contract as SMS.
    brevo_api_key: str | None = Field(
        default=None, description="Production email provider — takes precedence over SMTP."
    )
    brevo_sender_email: str | None = Field(
        default=None, description='e.g. "noreply@uhas.edu.gh" — Brevo requires a verified sender.'
    )
    brevo_sender_name: str | None = Field(
        default="UHAS SMS", description="Display name for Brevo sends."
    )
    smtp_host: str | None = Field(
        default=None, description="e.g. localhost (Mailpit) or smtp.gmail.com"
    )
    smtp_port: int = Field(default=465, description="465 → implicit TLS. Mailpit uses 1025.")
    smtp_user: str | None = Field(default=None, description="Unset for Mailpit — auth is optional.")
    smtp_password: str | None = Field(
        default=None, description="Gmail App Password, not the account password."
    )
    email_from: str | None = Field(
        default=None,
        description='e.g. "UHAS SMS <noreply@uhas.edu.gh>". Falls back to smtp_user.',
    )
    email_dev_redirect: str | None = Field(
        default=None,
        description="Outside production, every SMTP email goes here instead of the real recipient.",
    )

    # ── Outbound SMS ──────────────────────────────────────────────────────
    # Same "missing config isn't an error" contract as email above —
    # `get_sms_provider()` falls back through Hubtel -> Arkesel -> the
    # no-op `StubSmsProvider` depending on which of these are set, so
    # every environment runs the same code path. Hubtel is the school's
    # chosen provider and takes precedence when configured; Arkesel is
    # kept as a fallback for any environment that already has it set up.
    arkesel_api_key: str | None = Field(default=None)
    arkesel_sender_id: str | None = Field(
        default=None, description='Approved Arkesel sender name, e.g. "UHAS".'
    )
    hubtel_client_id: str | None = Field(default=None)
    hubtel_client_secret: str | None = Field(default=None)
    hubtel_sender_id: str | None = Field(
        default=None, description='Approved Hubtel sender name, e.g. "UHAS".'
    )

    # ── Supabase Auth "Send SMS" hook ──────────────────────────────────────
    # Unlike every other "missing config isn't an error" setting in this
    # file, this one fails CLOSED when unset — see
    # app/features/auth/router.py's send_sms_hook. A missing secret here
    # would mean the phone-OTP relay endpoint accepts unsigned requests.
    send_sms_hook_secret: str | None = Field(
        default=None,
        description=(
            'Supabase-generated Standard Webhooks secret, format "v1,whsec_<base64>". '
            "From the hosted project's Auth settings once the Send SMS hook is registered."
        ),
    )
    app_url: str = Field(
        default="http://localhost:3000",
        description="Base URL for links embedded in outbound email (the Next.js app).",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor.

    Cached because `Settings()` reads the env on construction; we don't
    want that to happen on every request. Tests can override by calling
    `get_settings.cache_clear()` then setting env vars.
    """
    return Settings()


# Convenience: read-only singleton for non-DI code paths.
settings = get_settings()
