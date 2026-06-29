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
