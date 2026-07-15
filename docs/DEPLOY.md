# Deployment Checklist

Production deploy checklist for the UHAS SMS app. Walk this top-to-bottom on every release that touches database schema, Supabase config (Auth/Storage), or background jobs. For routine code-only releases, the **Release runs** + **Post-deploy smoke** sections are enough.

Target stack: **Next.js + FastAPI on Railway** + **Supabase (Postgres, Auth, Storage)** + **Inngest** — see [CLAUDE.md](../CLAUDE.md) and [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md) for the full architecture. This replaces the pre-migration Neon + Firebase + Drizzle stack the previous version of this doc described.

---

## 1. Database (Supabase Postgres, via Alembic)

- [ ] A real (non-local-CLI) Supabase project exists for prod — confirm you're targeting the right one; prod and staging should be **separate Supabase projects**, never shared.
- [ ] Back up the current DB if it has real data:
  ```bash
  pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
  ```
- [ ] Verify migrations are committed under `apps/api/alembic/versions/` — hand-written, reviewed in the PR. **Autogenerate is never used**; that's the whole point of the reviewable-SQL convention (see [apps/api/README.md](../apps/api/README.md)).
- [ ] Railway env var set on the `api` service:
  - `DATABASE_URL` — the Supabase project's pooler connection string, e.g. `postgresql+asyncpg://postgres:<password>@<project>.pooler.supabase.com:5432/postgres` (from Supabase Dashboard → Project Settings → Database).
- [ ] Migrations now run automatically on every `api` deploy — wired in [`railway.toml`](../railway.toml):
  ```
  uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```
  Safe to run on every deploy — a no-op when the schema is already current.
- [ ] **Bootstrap the reference data — run once after `alembic upgrade head` on a fresh deploy:**
  ```bash
  uv run python -m app.scripts.seed_reference
  ```
  Creates the single-tenant **school row + config** (which has no create UI) and bulk-loads the **subject curriculum** (36 rows). It is **idempotent** (insert-if-absent — never truncates, never modifies existing rows), so it's safe to run against a live DB and safe to re-run. After this, set the academic year + term dates in Settings → Calendar and create classes via `/admin/classes/new` (both have UI). Subjects can be edited/added at `/admin/subjects`.
- [ ] **The demo-data seed never runs against prod.** `apps/api/app/scripts/seed/` (`uv run python -m app.scripts.seed`) truncates every table and injects fake staff/students/scores — it's dev-only and hard-refuses (`SystemExit`) when `ENV=production`. (It shares the same reference definitions as `seed_reference`, so dev and prod can't drift.) Remaining real school data goes in through the Admin UI — there's no bulk-import path yet.

## 2. Supabase Auth

- [ ] Real Supabase project's Auth is configured — Dashboard → Authentication.
- [ ] **Site URL** + **Redirect URLs** include the Railway web service's real URL (and any custom domain).
- [ ] **Email/password sign-in** enabled for staff; **phone (SMS OTP) sign-in** enabled for parents, with a real SMS provider configured in Supabase Auth settings (Twilio or similar — separate from the app's own Hubtel integration, which handles notification SMS, not OTP delivery).
- [ ] Railway env vars set on both services, from Supabase Dashboard → Project Settings → API:
  - `apps/api`: `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (must match what Supabase Auth signs tokens with — Project Settings → API → JWT Secret), `SUPABASE_SERVICE_ROLE_KEY`
  - `apps/web`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-side only — signed URLs, admin ops), `NEXT_PUBLIC_API_URL` (the `api` service's Railway URL)
- [ ] `apps/api`'s `CORS_ALLOW_ORIGINS` includes the `web` service's real URL — defaults to `http://localhost:3000` only.
- [ ] Seed the 9 role-anchored accounts once real staff/guardian records exist (or adapt `apps/web/scripts/_seed-data/users.ts` with real emails first) — `pnpm seed:supabase` against the prod project (point `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` at prod when running it). For a real launch this is almost certainly the wrong shape — real staff self-register or get invited via the Admin UI instead; treat the seed script as a bootstrapping convenience for the very first Admin account only.
- [ ] Production cookies are `secure` — enforced by `@supabase/ssr`'s cookie handling as long as the app is served over HTTPS. Railway provides HTTPS by default.
- [ ] **TOTP MFA enabled** for the opt-in 2FA feature (Profile → Security) — Dashboard → Authentication → settings (Multi-Factor Authentication → enable TOTP enroll + verify). The local `supabase/config.toml` `[auth.mfa.totp]` flags only affect the local CLI stack; they do **not** propagate to the hosted project. Without this, users can't enrol and the login-time challenge never triggers. Note: MFA is a Supabase Pro-plan feature.

## 3. Supabase Storage

- [ ] Buckets exist on the prod project matching [`supabase/config.toml`](../supabase/config.toml)'s definitions — Dashboard → Storage → New bucket:
  - `photos` — public, 10MiB limit, `image/png|jpeg|webp|gif`
  - `documents` — private, 50MiB limit, PDF/Word mime types
  - (`config.toml`'s bucket definitions apply to the local CLI stack automatically; a hosted project's buckets are created once via the Dashboard, or the Management API.)
- [ ] **Storage RLS policies applied** — this is the part that's easy to miss, because a missing policy fails silently as "new row violates row-level security policy" on the first real upload, not at deploy time. `storage.objects` has RLS enabled by default with zero policies, so every bucket needs explicit policies before anyone can upload:
  ```bash
  supabase login                              # once, opens a browser to authenticate the CLI
  supabase link --project-ref <prod-project-ref>   # once per project
  supabase db push                            # applies any pending files in supabase/migrations/
  ```
  Currently one file: `supabase/migrations/20260705125603_storage_object_policies.sql` (authenticated INSERT/UPDATE/DELETE on `photos`/`documents`; reads are either public (`photos`) or via service-role signed URLs (`documents`), so no read policy is needed). Run `supabase db push` again any time a new file lands in `supabase/migrations/` — this is a manual step, not wired into the Railway deploy (see the comment in `railway.toml` for why).
- [ ] **No emulator/local URLs baked into prod env vars** — verify `NEXT_PUBLIC_SUPABASE_URL` points at the real project, not `127.0.0.1`.

## 4. Background jobs (Inngest)

- [ ] Inngest Cloud account + app registered (or self-hosted Inngest — the local `docker-compose.yml` dev server isn't for production).
- [ ] Railway env vars on `apps/api`: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (from the Inngest Cloud dashboard). Without these, `app/core/inngest.py` runs in dev mode against a nonexistent dev server — jobs silently fail to run in prod.
- [ ] Inngest Cloud's app URL points at `<api-service-url>/api/inngest`.
- [ ] Smoke test: trigger the `job/ping` health job (or any real event, e.g. a lesson-plan rejection) and confirm it shows as executed in the Inngest Cloud dashboard.

## 5. SMS (Hubtel)

`HubtelSmsProvider` is fully implemented and is the primary provider (`app/integrations/sms/provider.py`'s `get_sms_provider()` — Hubtel first, Arkesel fallback, `StubSmsProvider` if neither is configured). Every SMS send with no provider configured gets logged to `sms_log` with a fake `stub-<id>` and never actually sends — safe for dev/CI but **silently disables real SMS in prod if forgotten**.

- [ ] Hubtel account + registered sender ID.
- [ ] Hubtel API credentials as Railway env vars on `apps/api`: `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_SENDER_ID`.
- [ ] **Smoke test post-deploy**: trigger a fee reminder (or any SMS-sending flow) and confirm a real message arrives, not a `stub-` id in `sms_log`.

## 6. Outbound email

Provider-agnostic (`apps/api/app/integrations/email/provider.py`) — `BrevoEmailProvider` is the primary provider (`get_email_provider()` — Brevo first, SMTP/Mailpit fallback, not-configured stub last). Missing config isn't an error — emails are logged instead of sent, safe for dev/CI but **silently disables real email in prod if forgotten**.

- [ ] Brevo account + a verified sender (Brevo dashboard → Senders, or full domain authentication via SPF/DKIM for `uhas.edu.gh`).
- [ ] Railway env vars on `apps/api`:
  - `BREVO_API_KEY=<from Brevo dashboard — Settings > SMTP & API > API Keys>`
  - `BREVO_SENDER_EMAIL=<the verified sender>`, `BREVO_SENDER_NAME=UHAS SMS`
  - `APP_URL=https://<railway-or-custom-domain>` — links in emails land here
  - Do **not** set `EMAIL_DEV_REDIRECT` in production (it's a dev safety net)
- [ ] **Smoke test post-deploy**: as a Unit Head, reject a submitted lesson plan with a comment. The teacher receives an email with the comment + a link to the plan.

## 7. Observability (optional but recommended)

Both are silent no-ops until configured — safe to defer, but worth doing before a real launch:

- [ ] Sentry: create a project, set `SENTRY_DSN` + `SENTRY_TRACES_SAMPLE_RATE` on `apps/api`; `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_TRACES_SAMPLE_RATE` (+ `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` for source-map upload at build time) on `apps/web`.
- [ ] Logfire: create a workspace, set `LOGFIRE_TOKEN` on `apps/api`.
- [ ] **If you create a non-production Railway environment** (staging, dev) for `apps/web`: set `NEXT_PUBLIC_APP_ENV=development` on that environment's variables to show the dev-mode banner there. `NODE_ENV` alone can't distinguish it from real production — every Railway environment runs the same `next build && next start`, which always hardcodes `NODE_ENV=production`. Leave unset on the real production environment.

## 8. Rate limiting

`apps/api` rate-limits every route except `/health` (see `app/core/rate_limit.py` for the design rationale — keyed by authenticated user id, not IP). Works out of the box with in-memory counters, correct only for a single instance:

- [ ] **Before ever scaling `apps/api` to more than one Railway replica**: add a Redis service on Railway and set `REDIS_URL` on the `api` service to its connection string. Without this, each replica enforces the limit independently, silently multiplying the effective cap by the replica count.
- [ ] Not required for the current single-instance deployment — safe to defer indefinitely if `apps/api` never scales horizontally.

## Pre-flight

- [ ] CI is green on `main` — `web` job (lint + tsc + Vitest + build) and `api` job (ruff + mypy + pytest + Alembic-upgrade-from-scratch + OpenAPI/TS drift check). The Playwright E2E job is currently disabled (`if: false`) — not a release gate.
- [ ] `apps/web/src/types/api.d.ts` has no drift from the deployed API schema (`bash scripts/check-api-types-drift.sh` from repo root).
- [ ] Optional pre-flight: build locally against a prod-shaped env file to catch missing env vars before the deploy.

## Release runs

Triggered by pushing to `main`. Railway (per [`railway.toml`](../railway.toml)):

1. Builds `web` (Railpack + Node 20) and `api` (`apps/api/Dockerfile` — `uv sync --frozen` plus the system libraries WeasyPrint needs for report-card PDF rendering) independently — each only rebuilds when its own `source` path changes.
2. `web` starts with `pnpm --filter uhas-sms-webapp start` — no DB step; Next.js has zero direct database access.
3. `api` starts with `uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT` — migrations apply automatically, safe to re-run every deploy.
4. Restart policy: `on_failure`, up to 5 retries, per service.

**Supabase-platform migrations are not part of this flow.** If the release includes a new file in `supabase/migrations/`, run `supabase db push` against the linked prod project separately (see §3) — before or after the Railway deploy, but before anyone hits the affected feature.

## Post-deploy smoke

Run after every release that touches DB / Auth / Storage / Jobs.

1. **Login** as Admin (real credentials) lands on `/admin` — confirms Supabase Auth + session cookies + the FastAPI `/me` round-trip.
2. **Register a student** via the UI → success toast → row appears in the list. Confirms FastAPI writes + audit-log + form flow.
3. **Open Lesson Plans review queue** as Unit Head / Deputy Head → renders without error. Confirms role-based routing + division-scoped queries.
4. **Upload a photo** to a student or staff profile → image displays in the avatar everywhere it appears. Confirms Supabase Storage write + the `photos` bucket's RLS policy + public-read.
5. **Upload a document** to a lesson plan → "View attachment" issues a fresh signed URL on click. Confirms the `documents` bucket's RLS policy + server-side signing (`lib/storage-admin.ts`).
6. **Reject a submitted lesson plan** with a comment → teacher receives an email. Confirms the Inngest job runner + SMTP.
7. **Hit `/admin/audit-log`** → entries from steps 2 and 4 appear with the correct admin identity.
8. **Download a report card as PDF** from a student's report-card page → a real PDF downloads (not a 500). Confirms WeasyPrint's system libraries are actually present in the deployed `api` image — this is exactly the kind of failure that's silent locally (works on a dev machine with the libraries installed some other way) and only surfaces against the real Docker build.

If any step fails, **roll back** before investigating — don't leave a broken release running.

## Rollback

- **Railway:** redeploy the previous successful build from the Deploys tab. One click, per service.
- **Database:** Alembic migrations are forward-only. If one must be reversed, write a new migration that performs the reverse and redeploy. **Never** hand-edit the `alembic_version` table against prod — that desyncs Alembic's tracking from the actual schema.
- **Supabase Storage policies:** same principle — write a new migration file that drops/replaces the policy, `supabase db push` again. Don't hand-edit policies via the Dashboard SQL editor without also committing the equivalent migration file, or `supabase/migrations/` silently drifts from reality.
- **Auth / Storage buckets / uploaded files:** persist across app rollbacks; no action needed.

## Out of scope for now

- **Real report-card PDF rendering** — Inngest jobs write a placeholder to Storage today, not an actual PDF.
- **Multi-school tenancy** — the backend already resolves `school_id` per-JWT (not a hardcoded constant), but there's no onboarding flow to create a second school yet.
- **Automating the `supabase db push` step in CI/CD** — currently manual by design, given how rarely Supabase-platform migrations change; revisit if that cadence increases.
