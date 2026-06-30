# `apps/api` — FastAPI backend

The Python side of the Strategy A architecture. Talks to Supabase Postgres via SQLAlchemy (added in PR #3), serves the Next.js frontend at `apps/web/` over HTTP. See [`v2/UHAS_Backend_Architecture_v1.1.md`](../../v2/UHAS_Backend_Architecture_v1.1.md) for the full design.

## Status

**Phase 0 PR #2 — Skeleton.** What's wired:

- ✅ `uv` for env + deps (`pyproject.toml`, `uv.lock`, `.python-version`)
- ✅ FastAPI app with CORS + global error envelope (`app/main.py`)
- ✅ `app/core/` — config, errors
- ✅ `app/features/health/` — first feature (router, schema, tests)
- ✅ Tooling: `ruff` (lint + format), `mypy` (strict), `pytest` (+ asyncio)
- ✅ CI job runs lint + format-check + mypy + pytest

Not yet wired (intentional — future PRs):

- ❌ SQLAlchemy + Alembic — PR #3
- ❌ Supabase Auth JWT verification — Phase 1
- ❌ Inngest client + jobs — PR #3
- ❌ Hubtel SMS integration — Phase 3
- ❌ Sentry + Logfire — PR #5
- ❌ Pre-commit hooks (`ruff`, `mypy`) at repo root — still TODO (lefthook or husky-mono)

## Quick start

```bash
cd apps/api

uv sync                    # installs deps from uv.lock into .venv

uv run uvicorn app.main:app --reload --port 8000
# → http://localhost:8000/health
# → http://localhost:8000/docs       (Swagger UI)
# → http://localhost:8000/openapi.json
```

## Commands

```bash
uv run ruff check .          # Lint
uv run ruff format .         # Auto-format (or `--check` to verify only)
uv run mypy app              # Type-check
uv run pytest                # Run tests
uv run pytest -v             # Verbose
```

## Layout

```
apps/api/
├── pyproject.toml           # Project metadata + ruff/mypy/pytest config
├── uv.lock                  # Pinned dependency graph
├── .python-version          # 3.12
│
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app + router registration + error handler
│   │
│   ├── core/                # Cross-cutting concerns only
│   │   ├── config.py        # pydantic-settings — env-driven
│   │   └── errors.py        # AppError + 404/409/403/401/400 subclasses
│   │
│   └── features/            # Feature-self-contained domains (per BA §4)
│       └── health/
│           ├── router.py    # /health endpoint
│           ├── schema.py    # Pydantic response model
│           └── tests/
│               └── test_health.py
```

Future features follow the same shape: `router.py` + `schema.py` + `repository.py` + `service.py` + `model.py` + `tests/`. The `core/` folder is reserved for cross-cutting concerns only — feature logic belongs in `features/<domain>/`.

[`app/features/students/schema.py`](app/features/students/schema.py) is a reference example for the **Pydantic schema convention** — `StudentBase` / `StudentCreate` / `StudentUpdate` / `StudentRead` / `StudentList`. The students domain itself is ported in Phase 2 (no router yet); the schema file is checked in early so every other domain has a pattern to copy. See [docs/ENGINEERING-CONVENTIONS.md §20-22](../../docs/ENGINEERING-CONVENTIONS.md) for the rules.

**Tests live with the feature** — `app/features/<domain>/tests/test_*.py` for unit and router tests (with a feature-scoped `conftest.py`). The top-level `apps/api/tests/` directory exists only for cross-feature integration tests and E2E flows; it doesn't exist yet because no such tests do.

## Configuration

Environment variables go in `apps/api/.env` (gitignored). Today the only setting is `ENV` (defaults to `dev`). The full env-var surface grows in Phase 1 (Supabase + JWT) and Phase 3 (Hubtel + Inngest). See `app/core/config.py` for the canonical list.
