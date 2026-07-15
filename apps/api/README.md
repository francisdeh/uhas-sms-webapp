# `apps/api` — FastAPI backend

The Python side of the Strategy A architecture. Talks to Supabase Postgres via SQLAlchemy + Alembic, verifies Supabase Auth JWTs, and serves the Next.js frontend at `apps/web/` over HTTP — the only mutation/read path left; Drizzle and Next.js Server Actions were fully decommissioned in Phase 2. See [`v2/UHAS_Backend_Architecture_v1.1.md`](../../v2/UHAS_Backend_Architecture_v1.1.md) for the full design and [`v2/UHAS_Migration_Execution_Plan.md`](../../v2/UHAS_Migration_Execution_Plan.md) for phase-by-phase status.

## Status

**Phase 3 (Storage, Jobs, SMS) complete.** What's wired:

- ✅ `uv` for env + deps (`pyproject.toml`, `uv.lock`, `.python-version`)
- ✅ FastAPI app with CORS + global error envelope (`app/main.py`)
- ✅ SQLAlchemy 2.0 (async) + Alembic — 28 feature domains under `app/features/`, 35 tables
- ✅ Supabase Auth JWT verification (`app/core/security.py`, `app/core/deps.py`) — every route is role/scope-gated
- ✅ Inngest client + job runner (`app/core/inngest.py`) — jobs live in each feature's `jobs/` subfolder
- ✅ Supabase Storage integration (`app/integrations/storage.py`) — public photos, signed document URLs
- ✅ SMS domain — `SmsProvider` interface + `sms_log` table; real `HubtelSmsProvider` (primary) + `ArkeselSmsProvider` (fallback), stub when neither is configured
- ✅ Outbound email (`app/integrations/email/`) — real `BrevoEmailProvider` (primary) + SMTP/Mailpit fallback, provider-agnostic, logs instead of failing when unconfigured
- ✅ Sentry (job + request error capture, PII-scrubbed) + Logfire — both no-op when credentials are unset
- ✅ Tooling: `ruff` (lint + format), `mypy` (strict), `pytest` (+ asyncio, 510+ tests)
- ✅ CI job runs lint + format-check + mypy + pytest + Alembic-upgrade-from-scratch + OpenAPI/TS drift check
- ✅ Demo-data seed script (`app/scripts/seed/`) — wipes and re-populates every business-data table; see "Seeding demo data" below

Not yet wired:

- ❌ Real report-card PDF rendering — the Inngest jobs exist and write to Storage, but the body is a placeholder (nothing in the repo turns exam data into PDF bytes yet)
- ❌ Pre-commit hooks (`ruff`, `mypy`) at repo root — still TODO (lefthook or husky-mono)
- ❌ Rate limiting — no throttling middleware anywhere yet; needs an audit of auth-adjacent + SMS-triggering routes before real users hit them
- ❌ Sentry/Logfire *activation* — the instrumentation is wired (see above) but stays a no-op until real project credentials are provisioned and set via env vars
- ❌ HTML email templates — `EmailMessage.html` is supported by the provider but unused; every current sender builds a plain-text body

## Quick start

```bash
cd apps/api

uv sync                    # installs deps from uv.lock into .venv

# Needs a local Supabase stack running first — `supabase start` from the
# repo root. See the root README's Getting Started for the full sequence.
uv run alembic upgrade head          # apply schema (35 tables)
uv run python -m app.scripts.seed    # optional — populate demo data (see below)

uv run uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/health
# → http://localhost:8000/docs       (Swagger UI)
# → http://localhost:8000/openapi.json

# Optional, in another terminal — background job runner:
uv run inngest-cli dev -u http://localhost:8000/api/inngest
# → http://localhost:8288 (dev UI)
```

## Commands

```bash
uv run ruff check .          # Lint
uv run ruff format .         # Auto-format (or `--check` to verify only)
uv run mypy app               # Type-check
uv run pytest                # Run tests
uv run pytest -v             # Verbose
uv run alembic upgrade head  # Apply migrations
uv run alembic revision -m "…"  # New migration — hand-write op.* calls, no autogenerate
```

## Seeding demo data

```bash
uv run python -m app.scripts.seed
```

Wipes and re-populates every business-data table (`TRUNCATE ... CASCADE`, then re-inserts) — one school (UHAS Basic School, Volta Region), 17 staff, 41 guardians, 112 students across 11 classes, plus exams/scores, two weeks of attendance history, lesson plans/schemes/assignments in every workflow status, and a handful of announcements/calendar events/appointments. Reset-only by design — there's no upsert/idempotent mode; re-run anytime for a clean slate.

The 9 Supabase Auth test accounts (`apps/web/scripts/_seed-data/users.ts` → `pnpm seed:supabase`) are auth-only — this script is what makes them actually functional, by creating the `staff`/`guardians`/`users` rows their JWT claims point at, using the same deterministic-UUID scheme (`app/scripts/seed/det.py`, a Python port of `apps/web/src/lib/uuid.ts`'s `det()`). The two scripts are independent (one hits Supabase Auth, the other hits Postgres directly) — run them in any order, just run both before trying to log in.

Refuses to run against `settings.env == "production"`.

## Layout

```
apps/api/
├── pyproject.toml           # Project metadata + ruff/mypy/pytest config
├── uv.lock                  # Pinned dependency graph
├── .python-version          # 3.14
├── alembic/versions/        # Hand-written migrations, linear history
│
├── app/
│   ├── main.py               # FastAPI app + router/job registration + error handler
│   │
│   ├── scripts/seed/         # Demo-data seed script — see "Seeding demo data" above
│   │
│   ├── core/                 # Cross-cutting concerns only
│   │   ├── config.py         # pydantic-settings — env-driven, every var has a dev default
│   │   ├── db.py             # SQLAlchemy engine + session factory
│   │   ├── deps.py           # Auth/role FastAPI dependencies (CurrentUserDep, RequireAdmin, …)
│   │   ├── security.py       # Supabase JWT verification
│   │   ├── errors.py         # AppError + 401/403/404/409/422/503 subclasses
│   │   ├── inngest.py        # Inngest client + Sentry-wrapping decorator for jobs
│   │   ├── observability.py  # Sentry + Logfire init (no-op when unconfigured)
│   │   ├── pagination.py     # Paginated[T] generic response envelope
│   │   ├── roles.py          # Role constants — mirror apps/web/src/features/auth/types.ts
│   │   ├── school_structure.py  # Division literal + KG/Primary/JHS constants
│   │   └── slug.py           # Sequential per-school slug generation (STAFF-001, …)
│   │
│   ├── integrations/         # Third-party service adapters — Protocol + real + stub
│   │   ├── storage.py        # Supabase Storage (photos public, documents signed)
│   │   ├── email/            # SMTP, provider-agnostic
│   │   └── sms/              # SmsProvider interface + real Hubtel/Arkesel providers + stub
│   │
│   └── features/             # 28 self-contained domains (per BA §4)
│       └── <domain>/
│           ├── router.py     # HTTP routes
│           ├── schema.py     # Pydantic request/response models
│           ├── service.py    # Business logic + invariants
│           ├── repository.py # Query layer
│           ├── model.py      # SQLAlchemy ORM model
│           ├── jobs/         # Inngest functions, if this domain has any
│           └── tests/        # conftest.py + test_*.py, feature-scoped
```

Every feature follows the same shape. The `core/` folder is reserved for cross-cutting concerns only — feature logic belongs in `features/<domain>/`; third-party service clients belong in `integrations/`.

See [docs/ENGINEERING-CONVENTIONS.md](../../docs/ENGINEERING-CONVENTIONS.md) for the Pydantic schema convention (`Base` / `Create` / `Update` / `Read`), role-gating patterns, and test fixture conventions (each feature's `tests/conftest.py` claims its own UUID range to avoid cross-suite collisions).

**Tests live with the feature** — `app/features/<domain>/tests/test_*.py` and `app/core/tests/`, `app/integrations/*/tests/` for cross-cutting code. There's no top-level `apps/api/tests/` — nothing needs one yet.

## Configuration

Environment variables go in `apps/api/.env` (gitignored, copy from `.env.example`). Every setting has a working default for local dev against the Supabase CLI stack — a fresh checkout boots with zero `.env` file. Copy `.env.example` → `.env` and fill in real values only when pointing at something other than local Supabase (a hosted project, SMTP credentials, Inngest Cloud, Sentry/Logfire). See `app/core/config.py` for the canonical, documented list — every field has a `description`.
