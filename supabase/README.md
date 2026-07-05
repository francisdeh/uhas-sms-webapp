# `supabase/` — Supabase CLI project

Local Supabase brings up Postgres + Auth + Storage in containers so you can develop the full stack offline. The CLI manages this folder; we don't author it by hand.

## One-time setup

```bash
# Install the CLI
brew install supabase/tap/supabase     # macOS
# or via npm: npm install -g supabase

# Initialise this folder (creates supabase/config.toml)
cd /Users/francisdeh/Projects/uhas-sms-webapp
supabase init

# Bring up the local stack
supabase start
```

`supabase start` outputs the local URLs + anon/service keys; paste them into the project env files. The anon key is a well-known constant for every local Supabase CLI install (already pre-filled in `apps/web/.env.local.example`) — only `SUPABASE_SERVICE_ROLE_KEY` actually needs copying from the CLI output, on both sides:

```bash
# apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from supabase start — same value every local install>
NEXT_PUBLIC_API_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>

# apps/api/.env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<from supabase start>
DATABASE_URL=postgresql+asyncpg://postgres:postgres@127.0.0.1:54322/postgres
```

## Where the schema lives

**Application schema** (`schools`, `students`, every domain table) is managed by **Alembic in [`apps/api/alembic/`](../apps/api/alembic/)**, not by `supabase/migrations/`. After `supabase start`, populate it with:

```bash
cd apps/api
uv run alembic upgrade head
```

The baseline migration (`fb2f367656c5_drizzle_baseline_port.py`) creates the 33 tables from the snapshotted Drizzle schema; later migrations have added more as new domains landed (35 total as of Phase 3 — `lesson_plan_reviews`, `sms_log`, etc.). Schema changes go through hand-written Alembic revisions reviewed in the PR — see any file in `apps/api/alembic/versions/` for the pattern.

**Supabase platform config** (Storage RLS policies, Auth hooks, anything that lives in Supabase's own schemas rather than the app's) goes through `supabase/migrations/` instead — that's genuinely Supabase-CLI-managed territory, separate from the app schema above. Currently just one: `storage_object_policies.sql`, granting authenticated INSERT/UPDATE/DELETE on the `photos`/`documents` buckets (`storage.objects` has RLS on by default with zero policies out of the box, which silently blocks every upload until something explicitly allows it). Applied automatically on a brand-new `supabase start` (first-time volume) or by `supabase db reset` — for an already-running stack, run the file's SQL directly instead of resetting, which would also wipe every seeded row.

## Daily workflow

```bash
supabase start                          # Postgres + Auth + Storage up
cd apps/api && uv run alembic upgrade head   # apply schema
uv run uvicorn app.main:app --reload    # backend on :8000
cd ../web && pnpm dev                   # frontend on :3000
```

To reset local state:

```bash
supabase db reset                       # drops + re-applies migrations
# or:
supabase stop && supabase start         # nuke containers + restart fresh
```

## Folder contents

```
supabase/
├── config.toml             # Local stack config (ports, services enabled) — CLI-managed
├── .gitignore              # CLI-managed; covers .branches/, .temp/, .env.*
└── migrations/             # Supabase platform config only (Storage RLS, etc.) —
                             # NOT the app schema; that's Alembic in apps/api/
```

## Ports the local stack uses

Run while `supabase start` is up:

| Service | URL | Notes |
|---|---|---|
| API gateway | http://127.0.0.1:54321 | Auth, REST, Storage, Realtime, Functions |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres | Direct DB access |
| Studio | http://127.0.0.1:54323 | Web UI |
| Mailpit / Inbucket | http://127.0.0.1:54324 | Catches outbound auth emails locally |

`supabase status` shows them anytime. `supabase stop` brings the stack down.
