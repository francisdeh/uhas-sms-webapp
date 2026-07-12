# UHAS Basic School — Management System

A web-based School Management System for UHAS Basic School, Ghana. Covers student & staff administration, attendance, examinations, lesson plan workflows, and parent communication.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript, reads/writes only through the FastAPI client |
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Alembic — [`apps/api/`](apps/api/) |
| Database | PostgreSQL — Supabase-managed in production, Supabase CLI locally |
| Auth | Supabase Auth (email/password for staff, phone OTP for parents) |
| File Storage | Supabase Storage (`photos` public bucket, `documents` private + signed URLs) |
| Background jobs | Inngest (SMS fan-out, report generation, lesson-plan-rejection email) |
| SMS | Hubtel — interface built, stubbed pending account/sender-ID registration |
| Client Data | TanStack Query v5 |
| Notifications | Sonner (toasts) |
| Hosting | Railway |

---

## Prerequisites

- Node.js 22+ (pnpm 11 requires ≥22.13)
- [pnpm](https://pnpm.io) 11.9+ (`npm install -g pnpm` if you don't have it)
- Python 3.14 + [uv](https://docs.astral.sh/uv/) (`apps/api/.python-version` pins the version; `uv` installs it automatically)
- [Supabase CLI](https://supabase.com/docs/guides/cli) 2.x (`brew install supabase/tap/supabase` or see their docs) — runs the local Postgres/Auth/Storage stack
- Docker Desktop (Supabase CLI's local stack runs in Docker; also used for the local Inngest dev server)

---

## Getting Started

> **Monorepo note.** The Next.js app lives in [`apps/web/`](apps/web/); the FastAPI backend lives in [`apps/api/`](apps/api/) and is uv-managed Python (see [apps/api/README.md](apps/api/README.md)). The pnpm workspace lockfile is at the repo root; `pnpm install` runs there once and hoists `node_modules` for every package. App-scoped scripts (`pnpm dev`, `pnpm test`, etc.) run from inside `apps/web/`. `docker compose`, `git`, and `supabase` CLI commands run from the repo root.

### 1. Install dependencies

From the repo root:

```bash
pnpm install                       # Next.js workspace
cd apps/api && uv sync && cd ../..  # FastAPI — installs into apps/api/.venv
```

### 2. Start the local Supabase stack

From the repo root (needs the `supabase/` config dir):

```bash
supabase start
```

First run pulls Docker images and takes a minute or two. This brings up local Postgres (`54322`), Auth (`54321`), Storage, and Studio (`54323`). Copy the `anon key` / `service_role key` it prints — you need them in the next step.

### 3. Set up environment variables

```bash
# FastAPI
cp apps/api/.env.example apps/api/.env
# Defaults already point at the local Supabase stack — no edits needed
# unless you're pointing at a real project.

# Next.js
cp apps/web/.env.local.example apps/web/.env.local
# Paste the anon key from `supabase start` into NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and the service_role key into SUPABASE_SERVICE_ROLE_KEY.
```

### 4. Apply database migrations

```bash
cd apps/api
uv run alembic upgrade head
cd ../..
```

### 5. Seed demo data

```bash
# Auth accounts (Supabase) — the 9 test accounts, see Test Accounts below
cd apps/web && pnpm seed:supabase && cd ../..

# Business data (Postgres) — school, staff, students, classes, everything else
cd apps/api && uv run python -m app.scripts.seed && cd ../..
```

Either order works — they hit two independent systems (Supabase Auth vs. Postgres) but agree on the same deterministic IDs, so the auth accounts' `linked_id`/`school_id` claims resolve to real rows either way. The business-data script is reset-only (wipes + re-seeds every run) — safe to re-run anytime.

### 6. Start the background job runner (Inngest)

```bash
docker compose up -d      # from the repo root — brings up the Inngest dev server
# equivalent: cd apps/web && pnpm docker:up
```

Or run it directly instead: `cd apps/api && uv run inngest-cli dev -u http://localhost:8000/api/inngest`. Either way, the dev UI is at `http://localhost:8288`. Jobs only fire in response to events triggered elsewhere in the app (SMS sends, lesson-plan rejections) — nothing breaks if you skip this for pure frontend work.

### 7. Start the backend

```bash
cd apps/api
uv run uvicorn app.main:app --reload --port 8000
```

API runs at `http://localhost:8000` — Swagger UI at `/docs`, OpenAPI schema at `/openapi.json`.

### 8. Start the frontend

```bash
cd apps/web
pnpm dev
```

App runs at `http://localhost:3000`.

---

## Test Accounts (Supabase Auth)

Defined in [`apps/web/scripts/_seed-data/users.ts`](apps/web/scripts/_seed-data/users.ts), created by `pnpm seed:supabase` (repo root: `cd apps/web && pnpm seed:supabase`). Fully functional once you've also run the business-data seed (`cd apps/api && uv run python -m app.scripts.seed`) — see [Seed demo data](#5-seed-demo-data) above.

| Role | Email | Password | Notes |
|---|---|---|---|
| Admin | admin@uhas.edu.gh | Admin@1234 | |
| Deputy Head (JHS) | dh.jhs@uhas.edu.gh | Deputy@1234 | |
| Deputy Head (Lower Primary) | dh.lower-primary@uhas.edu.gh | Deputy@1234 | |
| Deputy Head (Upper Primary) | dh.upper-primary@uhas.edu.gh | Deputy@1234 | |
| Deputy Head (KG) | dh.kg@uhas.edu.gh | Deputy@1234 | |
| Teacher (Unit Head — JHS) | unit-head.jhs@uhas.edu.gh | UnitHead@1234 | |
| Teacher | teacher@uhas.edu.gh | Teacher@1234 | |
| Parent | parent@uhas.edu.gh | Parent@1234 | Also `+233200000001` + OTP `123456` (local `test_otp`, no real SMS) |
| Accountant | accountant@uhas.edu.gh | Accountant@1234 | |

---

## Available Scripts

All run from `apps/web/` unless noted. FastAPI-side commands are covered in [apps/api/README.md](apps/api/README.md#commands).

| Script | Description |
|---|---|
| `pnpm dev` | Start dev server (webpack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve a production build |
| `pnpm lint` | ESLint |
| `pnpm generate:api-types` | Regenerate `src/types/api.d.ts` from the running FastAPI's `/openapi.json` — run after any backend schema/route change |
| `pnpm seed:supabase` | Create the Supabase Auth test accounts (see [Test Accounts](#test-accounts-supabase-auth)) — auth only, doesn't seed business data |
| `docker compose up -d` (repo root) / `pnpm docker:up` | Start the local Inngest dev server (background jobs) |
| `pnpm docker:down` | Stop the Inngest container |
| `pnpm docker:reset` | Recreate the Inngest container from a clean state |
| `pnpm test` | Run the Vitest suite (`.env.test`) |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm e2e:build` | Production build for Playwright (run after schema/UI changes) |
| `pnpm e2e` | Run the Playwright E2E suite (`.env.e2e`) |
| `pnpm e2e:ui` | Playwright UI mode |
| `pnpm e2e:headed` | Playwright in headed Chromium |

---

## Project Structure

```
uhas-sms/
├── apps/
│   ├── web/                            # Next.js frontend — UI + API client only,
│   │   │                                # no DB access, no Server Action mutations
│   │   ├── src/
│   │   │   ├── app/                    # App Router — (auth) + (dashboard)/<role>/
│   │   │   ├── components/ui/          # shadcn primitives
│   │   │   ├── features/<domain>/      # components/, actions/ (thin wrappers calling
│   │   │   │                            # the FastAPI client), types.ts
│   │   │   ├── lib/                    # Cross-cutting: api/ (typed FastAPI client),
│   │   │   │                            # supabase/ (client, server, middleware), dates, …
│   │   │   ├── types/api.d.ts          # Generated from FastAPI's OpenAPI schema
│   │   │   └── proxy.ts                # Role-based routing (Next.js 16 middleware)
│   │   ├── tests/                      # Vitest (unit) + Playwright (e2e/)
│   │   ├── scripts/                    # seed-supabase-users.ts (Auth accounts only)
│   │   └── package.json
│   │
│   └── api/                            # FastAPI backend — Phase 3 complete, owns all
│                                        # data access + mutations; see apps/api/README.md
│
├── supabase/                           # Supabase CLI project (Auth/Storage/Postgres config)
│                                        # — schema itself lives in apps/api/alembic/
├── docs/                               # Persistent reference docs
├── v2/                                 # Migration plan set (Strategy A target)
├── docker-compose.yml                  # Local Inngest dev server
├── railway.toml                        # Multi-service deploy config (web + api)
└── .github/workflows/ci.yml            # Lint + tsc + Vitest (web), ruff + mypy + pytest (api)
```

---

## Environment Variables

Two separate env files — Next.js reads only from `apps/web/`, FastAPI reads only from `apps/api/`.

**`apps/web/.env.local`** (copy from [`.env.local.example`](apps/web/.env.local.example)):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL — `http://localhost:8000` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API gateway — `http://127.0.0.1:54321` locally |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same well-known value for every local Supabase CLI install; a real project's anon key in prod |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side only. Needed for `pnpm seed:supabase`; from `supabase status` locally |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_*` | Optional — Sentry is a silent no-op when unset |

**`apps/api/.env`** (copy from `.env.example`): every field has a working default for local Supabase, so a fresh checkout boots with zero `.env` file. Covers `DATABASE_URL`, `SUPABASE_*`, `INNGEST_*`, `SMTP_*`/`EMAIL_*`, `SENTRY_*`/`LOGFIRE_TOKEN`. See [apps/api/README.md](apps/api/README.md#configuration) and `app/core/config.py` (every field has a `description`) for the canonical list.

---

## Local Services

| Service | URL | Notes |
|---|---|---|
| Next.js app | http://localhost:3000 | `cd apps/web && pnpm dev` |
| FastAPI | http://localhost:8000 | `cd apps/api && uv run uvicorn app.main:app --reload --port 8000` — Swagger at `/docs` |
| Supabase API gateway | http://127.0.0.1:54321 | Auth, REST, Storage, Realtime — `supabase start` |
| Supabase Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres | Direct DB access |
| Supabase Studio | http://127.0.0.1:54323 | Web UI for the local Postgres/Auth/Storage stack |
| Mailpit / Inbucket | http://127.0.0.1:54324 | Catches outbound Supabase Auth emails locally |
| Inngest Dev Server UI | http://localhost:8288 | `docker compose up -d` (repo root) or `uv run inngest-cli dev` |

---

## School Structure

```
Head of Basic School (Admin)
├── Deputy Head — KG              → Class Teachers (KG 1–2)
├── Deputy Head — Lower Primary   → Class Teachers (Primary 1–3)
├── Deputy Head — Upper Primary   → Class Teachers (Primary 4–6)
└── Deputy Head — JHS             → Subject Teachers
```

**Unit Heads** are teachers with an extra flag (`isUnitHead`) — one per division. They keep teaching duties and get an extra sidebar section (Department, Reviews) to manage their unit. The Unit Head role is reassignable by Admin.

Classes: KG 1–2 · Primary 1–6 · JHS 1–3

---

## Development Phases

| Phase | Status | Deliverables |
|---|---|---|
| 0 — Foundation | ✅ Done | DB schema, Firebase emulator, mock fixtures, middleware, folder structure |
| 1 — Auth & User Management | ✅ Done | Login, role routing, change-password, reset-password (wired to Firebase `sendPasswordResetEmail`), admin user management UI (stats, DataTable, invite flow), dashboard shell (Sidebar, Header, profile page, academic year switcher, search, notifications, dark mode toggle). Non-admin dashboards (Deputy Head, Teacher, Parent) with live attendance stats. Session expiry warning modal: a `SessionExpiryWatcher` in `DashboardLayout` reads the `session_expires_at` cookie and shows an AlertDialog 5 min before expiry with a live countdown + Extend / Sign out buttons (Extend re-issues all session cookies for another 8h). |
| 2a — Student Records | ✅ Done | Student list (Admin + Deputy Head scoped), registration form, soft-deactivate/reactivate, division + status filter pills |
| 2b — Student Detail & ID Card | ✅ Done | Student detail view, edit profile, class transfer (with confirmation), printable ID card (browser print + @media print CSS) |
| 2c — Staff Management | ✅ Done | Staff list (Admin-scoped), registration form, role assignment, staff detail + edit + deactivate/reactivate. All on mock data. |
| 2d — Classes & Subjects | ✅ Done | Class list + create (fixed names), subject list + create, class detail with subjects/teacher assignment + student roster. All on mock data. |
| 3 — Attendance | ✅ Done | Student daily attendance (teacher + admin), staff attendance + leave requests (deputy head), parent attendance calendar view. Live attendance stats on Teacher, Deputy Head, and Parent dashboards. All on mock data. |
| 3.5 — Model Reconciliation | ✅ Done | Schema and mocks updated to match user feedback: division split (KG / Lower Primary / Upper Primary / JHS); HOD removed, Unit Head added as a flag on staff with conditional dashboard nav; multiple class teachers per class (junction); staff UHAS ID; student middle name; school-specific grading scale (Highest..Lowest, 1–9); attendance bulk "Mark all present" and required late-reason. |
| 4a — Score Entry | ✅ Done | Schema: scores columns for cat1/cat2/projectWork/groupWork; helpers for total/grade/position/aggregate. Admin: examinations list with create + publish/unpublish. Teacher: examinations landing + score entry grid (Mid-Term = raw 100, End-of-Term = 60% exam + 4×10% components placeholder), auto-computed total/grade, locked when exam published. |
| 4b — Report Card | ✅ Done | Server-rendered, browser-printable report card (`#report-card-print-area`, A4) matching the school template — logo placeholders, header, student info, Core/Elective subject tables with score/position/grade/interpretation, attendance, signatures, grading-scale legend, motto. Parent route `/parent/results/[studentId]/[examId]` (published only). Admin route `/admin/students/[id]/report-card/[examId]` (any exam, with unpublished notice). |
| 4c — Workflow | ✅ Done | New tables `class_report_submissions` + `student_report_remarks`. Class Teacher `/teacher/class-reports`: per-(exam × class) page with one textarea per student for class-teacher remarks; Save draft + Submit to Head of School. Admin `/admin/examinations/[examId]/review`: list of classes with submission status; per-class review page shows each student's class-teacher remark + a textarea for Head of School's comment (per-student save). Report card now renders both remark + comment rows. Publishing locks all remarks/comments. |
| 5a — Lesson Plans | ✅ Done | Teacher `/teacher/lesson-plans`: list, create, edit, delete, submit. Structured form (topic, learning objectives, teaching methods, resources, assessment plan, optional attachment URL). Approval chain: Teacher submits → Unit Head approves at `/teacher/reviews` → Deputy Head approves at `/deputy-head/lesson-plans` → status = approved. Reject with required comment at either stage; teacher edits drop back to draft. Status pill: draft / submitted / unit-head-approved / approved / rejected. |
| 5b — Schemes of Work / Learning | ✅ Done | New `schemes` table (type: `work` \| `learning`, structured `content` and/or `fileUrl`). Teacher `/teacher/schemes`: list + create/edit form with tab toggle between "Write from system" and "Upload URL". Submit to Head of School. Admin `/admin/schemes`: queue of pending submissions, expand to preview, optional comment + Acknowledge. |
| 5c — Assignments | ✅ Done | New `assignments` table. Teacher `/teacher/assignments`: list + create/edit + Publish/Unpublish/Delete with class/subject pickers tied to teacher's assigned subjects. Parent `/parent/assignments`: aggregates published assignments across all linked children's classes; shows due-date status (overdue / due today / upcoming), per-child attribution, attachment links. |
| 6a — Announcements | ✅ Done | New `features/announcements`. Audience = `all` \| `division:<D>` \| `class:<classId>`. Admin (`/admin/announcements`) posts to any audience and can delete any. Deputy Head (`/deputy-head/announcements`) scoped to their division. Parent (`/parent/announcements`) sees school-wide + announcements matching any linked child's division/class. Critical-flag badge surfaces everywhere. |
| 6b — Appointments | ✅ Done | New `appointments` table + feature. Parent `/parent/appointments`: child + teacher picker (teachers derived from child's class subject assignments and class-teacher junction), preferred date/slot, reason. Teacher `/teacher/appointments`: pending inbox with Confirm / Decline (decline requires a reason). Status: pending / confirmed / declined / cancelled; parent can cancel pending requests. |
| 7a — Reports dashboards | ✅ Done | New `features/reports` with stat queries per scope. Admin `/admin/reports`: school totals, gender breakdown, per-division population bars, lesson-plan workflow distribution, exam status, today's attendance progress. Deputy Head `/deputy-head/reports`: division-scoped stats, 7-day attendance, lesson-plan funnel, class ranking by aggregate. Teacher `/teacher/reports`: per-class attendance + subject averages. |
| 7b — PSC Report | ✅ Done | Admin `/admin/reports/psc` renders the printable Population & Staff Census: school totals, per-class boy/girl breakdown with division subtotals, school total, teachers grouped per division with Unit Head flag. Reuses the report-card print mode at A4. |
| 7c — Academic Calendar | ✅ Done | New `calendar_events` table + actions. Admin `/admin/calendar` adds/deletes events (term start/end, exam, holiday, event). Deputy Head, Teacher, Parent all see a read-only `/<role>/calendar` view with Upcoming and Past sections. |
| 5.7 — Student Promotion | ✅ Done | Year-end promotion workflow. After DB cutover, approval materialises real `enrollments` rows (Active for Promote, Repeating for Repeat), flips `students.isActive=false` for Withdraw, and writes one `PROMOTION_APPROVED` audit log row in a single transaction. |
| DB Cutover (mock → Drizzle) | ✅ Done, later superseded | Removed `USE_MOCK_DATA` and the entire `src/lib/mock/` directory. Every action and query went through Drizzle at this point — Drizzle itself was later removed in the Strategy A migration (see below); FastAPI + SQLAlchemy is the current data-access layer. `DB_DRIVER` env var picks `pg` for Docker/Railway or `neon-http` for Neon prod (auto-detects from `*.neon.tech` host). Generated baseline migration; `npm run db:migrate && npm run db:seed` brings up a fresh Postgres with the same demo data as before. Audit log wired for the four sensitive admin mutations. See `docs/superpowers/specs/2026-05-19-db-cutover-design.md`. |
| Audit log viewer | ✅ Done | Admin-only `/admin/audit-log`. Filters by action + date range (default last 30 days), pagination 50/page. Expandable rows show side-by-side before/after JSON with changed-key highlighting. |
| File uploads (originally Firebase Storage) | ✅ Done, backend later swapped | Reusable `ImageUploadField` / `FileUploadField` / `DocumentDownloadLink` / `UserAvatar` on student + staff + own-profile photos and lesson-plan/scheme/assignment attachments. Originally backed by the Firebase Storage emulator (`storage.rules`, port 9199); the storage backend itself moved to Supabase Storage (`photos` public, `documents` signed URLs) in Phase 3 — `apps/web/firebase.json` and `storage.rules` are now unused leftovers, not yet deleted. |
| Theme default + UX polish | ✅ Done | UHAS brand palette is now the default — root `<html data-color-scheme="uhas">` so it applies on first paint with no flash. `useTheme().setColorScheme("default")` still removes it. "Mark all present" is now a one-click action on both student and staff attendance sheets — stages everyone as present (keeping approved-leave staff on leave) and immediately saves. |
| 8 — Testing (layers 1 + 2) | ✅ Done | Vitest set up with a separate `uhas_sms_test` Postgres. 128 tests across 10 files (~12 s end-to-end). **Layer 1 (unit, no DB)** covers `computeGrade` / `computeTotalScore` / `assignSubjectPositions` / `computeAggregate`, `computePromotionSuggestion`, `autoPickTargetClass`, `nextAcademicYear`. **Layer 2 (integration, real DB)** covers auth (login, role redirect, mustChangePassword, change-password), students (create + transfer + audit), scores (save + compute + rerank + `SCORE_OVERRIDE` audit), promotions (full transaction: close + Active/Repeating/Withdraw + `PROMOTION_APPROVED` audit), attendance (save + leave-request lifecycle), audit-log helper + viewer queries. Tests caught one real bug: `saveScoresAction` looked up existing rows by a constructed ID that never matched the seed's IDs — now fixed. Scripts: `npm run db:test:setup` (one-shot, creates DB + migrates), `npm test`, `npm run test:watch`. |
| CI workflow | ✅ Done (superseded — see below) | Original `apps/web`-only CI: Postgres 16 service container, lint → tsc → tests → build, dummy Firebase env placeholders. Superseded by the two-job (`web` + `api`) workflow described in the Strategy A Migration row below. |
| 8 — Testing (layer 3) | ⚠️ Disabled since Strategy A migration | Playwright E2E (7 tests, 5 specs) targeted the pre-migration Firebase-auth + Server-Action surface and fails against the current Supabase + FastAPI stack. The CI job is wired but skipped (`if: false` in `.github/workflows/ci.yml`) rather than deleted. Re-porting the suite to the new auth flow + API client is tracked but not scheduled. |
| Outbound email | ✅ Done — moved to Python | Was `src/lib/email.ts` (nodemailer); ported 1:1 to `apps/api/app/integrations/email/` in Phase 3 and wired into the lesson-plan-rejection Inngest job. The old `apps/web/src/lib/email.ts` file is unused dead code now (nothing imports it) — not yet deleted. |
| Strategy A Migration (Phases 0–3) | ✅ Done | Replaced this table's entire Next.js-only architecture: FastAPI + SQLAlchemy/Alembic backend (`apps/api/`) is now the sole data-access + mutation path — Drizzle and Next.js Server Action mutations are fully decommissioned. Supabase replaced Firebase for both Auth and Storage. Phase 0: FastAPI skeleton + Supabase CLI/Alembic baseline. Phase 1: Supabase Auth (JWT `app_metadata` roles, `proxy.ts` routing). Phase 2: full DB cutover — every feature ported from Drizzle/Server Actions to FastAPI routers + SQLAlchemy. Phase 3: Inngest background jobs, Supabase Storage, SMS domain (Hubtel stubbed), email ported to Python. See [`v2/UHAS_Migration_Execution_Plan.md`](v2/UHAS_Migration_Execution_Plan.md) for phase-by-phase detail and [apps/api/README.md](apps/api/README.md) for current backend status. |
| Profile page completion | ✅ Done | Every tab is real now: Save Changes (display name + phone), Notification preferences, self-service deactivation, Active Sessions ("sign out other devices"), and **2FA/TOTP** (Supabase Auth MFA — enrol from Profile, login-time challenge, un-bypassable proxy `/verify-2fa` gate, admin `reset-mfa` for lockout recovery); photo upload + password change already were. Completes Phase 3.5. |
| Admin Settings page | ✅ Done | `/admin/settings` (Identity / Calendar / Grading / Communication / Security / Branding tabs) turned out to already be fully built from earlier work — an audit found every tab real and wired to the `schools` row, not the stale pre-migration stub the spec assumed. Remaining gap was narrower: `grading_bands`/`score_weights` were correctly consumed by score computation server-side already, but the score-entry live preview and the report-card/PDF grading-key legend still hardcoded the GES defaults — now both read the school's real resolved bands/weights. `session_timeout_minutes` was removed outright (unenforceable — Supabase Auth controls session expiry, not this app); `password_min_length`/`force_password_change_on_first_login` are now read-only in the UI since neither is wired to real enforcement yet. Part of Phase 3.5. |
| Drop JHS class streams | ✅ Done | School runs one class per level — no streams. Renamed `class-jhs1a/2a/3a` → `class-jhs1/2/3` and `"JHS 1A/2A/3A"` → `"JHS 1/2/3"` across seed + tests + UI. Deleted the now-dead `stripSuffix`/`streamSuffix` helpers and the three stream-specific tests; tightened the JHS-3-graduates check from `startsWith("JHS 3")` to `=== "JHS 3"`. |
| Real report-card PDF rendering | ✅ Done | `GET /students/{id}/report-card/pdf` renders the existing report-card template (Jinja2 port of `ReportCard.tsx`) to real PDF bytes via WeasyPrint, cached in Supabase Storage keyed by a content-hash of the assembled data (publish status doesn't actually lock scores/remarks, so caching couldn't key off that). `apps/api` now builds via its own `Dockerfile` (WeasyPrint's system libraries) instead of the `railpack` builder — Railway prefers a service's Dockerfile automatically, no `railway.toml` changes needed. Batch/bulk printing remains separate, deferred work. Part of Phase 3.5. |
| Rate-limiting audit | ✅ Done | No login/OTP endpoint exists in FastAPI at all — Supabase Auth handles that client-side — so the original "protect login" framing didn't apply; every route requires a verified JWT except `/health`. Added `slowapi`: a global 300/min-per-user default plus a stricter 10/min limit on the report-card PDF endpoint (the one route with a real cost profile). Keyed by authenticated user id from the JWT, not client IP — sidesteps `uvicorn` not being configured to trust Railway's `X-Forwarded-For`. In-memory storage today (correct for the current single Railway instance); `REDIS_URL` is wired for whenever `apps/api` scales to multiple replicas. Part of Phase 3.5. |
| 5 Slice 1 — Fee tracking core | ✅ Done | New `fees` feature: `fee_items` (catalog, scoped school/division/class) → `learner_fees` (one row per learner, soft-deletable) → `fee_payments` (Accountant-recorded, multi-file receipt uploads — no receipt generation). `RequireAccountant` dep. Bulk-assign a fee item to its scope's roster with individual edit/waive/exclude after. Accountant `/accountant` dashboard (balance/collected/overdue/active-items summary), `/accountant/fee-items` (list + create), `/accountant/fee-items/[id]` (roster + assign + record payment), `/accountant/balances` (school-wide, status-filterable). Decision gate closed: parents will not pay online, so no payment-gateway/`payment_gateway_events` work — bursar-collected only. Service-layer auth, consistent with every other domain (no RLS yet — tracked as a future hardening slice). See `docs/superpowers/specs/2026-07-09-fee-tracking-core-design.md`. Parent fee view + SMS reminders are separate follow-on slices. |
| 5 Slice 2 — Parent fee view | ✅ Done | `GET /fees/my-children` reuses the existing `StudentsService.list_for_guardian` ownership pattern (no new resolution logic) to return a Parent's own children's fee balances + payment history, with response schemas (`Parent*Read`) deliberately narrower than the Accountant-facing ones — no recorder identity, no receipt-file paths. `/parent/fees`: per-child total owed/outstanding plus an itemized fee breakdown with payment history, read-only, a pure Server Component (no client JS). See `docs/superpowers/specs/2026-07-09-parent-fee-view-design.md`. |
| 5 Slice 3 — Fee reminder SMS | ✅ Done | Real `HubtelSmsProvider` (Quick Send API, HTTP Basic auth, `respx`-mocked tests — no live Hubtel account yet, config-gated with a stub fallback exactly like the email integration). This codebase's first `inngest.TriggerCron` job (every prior job is event-triggered) and first "sweep every school" job: weekly (Mondays 07:00), texts + in-app-notifies each overdue fee's primary guardian, one message per guardian even with several overdue fees. No on-demand "send now" button — rejected as abuseable. `learner_fees.last_reminder_sent_at` (6-day idempotency cooldown) surfaces on the Accountant dashboard and balances table as "last reminded." Phase 5 complete. See `docs/superpowers/specs/2026-07-09-fee-reminder-sms-design.md`. |
| 6 item 1 — Student profile depth | ✅ Done | A pre-design audit found siblings + all-guardians display were already ~90% built (the only gap: `list_siblings` was Admin/Deputy-only — closed via the same parent-bypass `list_guardians` already had, no schema changes). Medical info (`blood_type`, `medical_notes`, `emergency_contact_name/phone`) and student documents (`student_documents` child table — labelled + accountable-uploader, not a bare JSONB array) were genuinely new. Both get their own gated endpoints rather than folding into `StudentRead`/`GET /students/{id}`, once implementation surfaced that endpoint has no role/ownership gate at all today — embedding sensitive fields there would have leaked them to every authenticated user in the school. Medical: viewable by Admin/Deputy(own division)/Teacher(teaches the class, new `_assert_can_view_medical` gate)/own-parent; editable by Admin or the student's own parent only. Documents: viewable by Admin/Deputy/own-parent; uploaded/deleted by Admin only — matching this feature's existing Admin-only-mutation precedent (Deputy already couldn't edit guardians or core student fields either). New `/parent/children/[id]` detail page (siblings, medical, documents) alongside the existing list page. See `docs/superpowers/specs/2026-07-09-student-profile-depth-design.md`. |
| 6 item 2 — Audit log filters | ✅ Done | `audit_log` already had indexes on `user_id` and `(target_table, target_id)` — no migration needed. Added `userId`/`targetTable`/`targetId` query params to `GET /audit-log` (mirrors the existing `action`/date-range pattern), a new `GET /audit-log/actors` (distinct actors who've actually appeared in this school's log, not the full staff/guardian directory — populates the user-filter dropdown), and a new `GET /audit-log/export` (CSV of every matching row, unpaginated, first CSV-export precedent in this codebase). Admin-only throughout, same as the existing list endpoint. |
| 6 item 7 — "Built by SimplifydLabs" attribution | ✅ Done | Shared `BuiltByAttribution` component (`apps/web/src/components/`), linked to simplifydlabs.com, used in the login-page footer and the dashboard sidebar footer — no existing dashboard-wide footer/about page to hook into, so the persistent sidebar chrome was the natural spot. |
| 6 item 4 — Staff profile depth | ✅ Done | Unlike the student-profile audit, this backlog item was accurately scoped — genuinely ~0% built (no `hire_date`, qualifications, subject-expertise link, or staff documents beyond `photo_url`). Added `staff.hire_date`; a `staff_subject_expertise` join table (open read, Admin-only full-replace `PUT` — a simple tag list, distinct from `class_subjects.teacher_id`'s current-assignment meaning); a `staff_qualifications` child table (open read, Admin-only add/remove); a `staff_documents` child table mirroring `student_documents`, but gated tighter than this feature's usual open-read precedent — `GET /staff/{id}/documents` is Admin-any-or-self-only. New "Qualifications" tab on the Admin staff-detail page; a read-only "My Documents" section on the self-service `/profile` page. Also fixed an unrelated pre-existing flaky test (`test_school_stats_admin` — a fixture computed "today" in local machine time instead of UTC, disagreeing with `ReportsService._today()` for ~2 hours a day). See `docs/superpowers/specs/2026-07-10-staff-profile-depth-design.md`. |
| 6 item 3 — Leave management depth | ✅ Done | A third distinct audit outcome — half right, half wrong: leave types + the request/approve workflow already existed, but balances, documents, and substitute cover were genuinely 0% built. The audit also surfaced three unrelated bugs, fixed in the same PR by explicit direction: a Deputy Head division-scope leak (any Deputy Head could view/approve/reject leave for staff in *any* division, despite a code comment falsely claiming otherwise — now enforced via the same `_assert_can_view_student`-style staff-division lookup pattern used elsewhere); a rejection-reason field that was collected in the UI and silently discarded, never sent to the backend; and no audit-log write on approve/reject (`LEAVE_DECIDED` action added). New: `leave_requests.document_urls` (bare JSONB array — always requester-uploaded at creation time, no labelled-child-table ambiguity like `student_documents`); `leave_requests.substitute_staff_id` (simple informational annotation, not a schedule override); Casual-leave balance computed on the fly (`schools.casual_leave_annual_days`, admin-configurable via new Settings "Leave" tab, minus the inclusive day-count of that staff member's approved Casual requests so far in the current UTC calendar year — deliberately not a maintained counter, so it can't drift). Only Casual-style leave gets a balance; the other six leave types don't draw against a quota. See `docs/superpowers/specs/2026-07-12-leave-management-depth-design.md`. |
| 6 item 5 — Report card polish | ✅ Done | A ground-truth audit found all five backlog sub-items genuinely 0% built, though two had partial groundwork: free-text `class_teacher_remark`/`head_of_school_comment` already existed (no structured conduct/co-curricular fields); `subject_position` (class rank) already existed (no class-average). New on `student_report_remarks`: `kg_observations` (JSONB, 5 fixed developmental domains, KG-only — `ReportCardService.get` skips the numeric score table entirely for `division == KG`) and `conduct_ratings`/`interests_co_curricular` (every division). Class-average is a same-class-and-exam `AVG(total_score)` query joined into each `ReportCardScoreRow`. Batch print resurrects the dormant, placeholder-only Inngest job pair (`reports/jobs/report_generate.py`/`report_batch.py`, deleted) as a real `exams/jobs/report_card_batch.py` — renders every student's PDF via the same content-hash-cached single-student renderer, zips them, and tracks status on a new `report_card_batch_jobs` table (async — the admin polls `GET .../report-cards/batch` for a signed download URL). Email-to-parent on publish wires the previously dead `RESULTS_PUBLISHED` notification kind: `ExamsService.set_published` resolves every student with scores/observations for that exam, creates one in-app notification per child, and (gated by the school's `notification_defaults.on_results_published` + a new per-user `email_on_results_published` preference, same two-tier gate as lesson-plan-rejection) emits one batched email per **primary guardian** listing all their newly-published children. See `docs/superpowers/specs/2026-07-12-report-card-polish-design.md`. |
| 6 item 8 slice 1 — Auth contact-info fixes | ✅ Done | First of a 4-PR "close the email/SMS gaps app-wide" initiative — a follow-up audit found the gap was much bigger than the original "appointments" framing (most domain events have in-app only; `announcements`' "email a copy" toggle doesn't exist in code at all; `appointments.cancel` has zero notification; `results_published`'s email opt-out pref has no frontend UI; a generic `sms/jobs/sms_fanout.py` fan-out job sat unused). This slice fixes matching phone AND email desync bugs: editing either anywhere in the app updated only the local `guardians`/`staff` mirror column, never Supabase Auth's own value — OTP login / password login silently kept authenticating against the *old* value after a "successful" change. Self-service phone goes through Supabase's `updateUser({phone})` → `verifyOtp({type:"phone_change"})`, then `POST /me/phone/confirm` mirrors back only what Supabase confirmed; self-service email goes through Supabase's link-based `updateUser({email})` confirmation (no inline code to pair with), with `POST /me/email/confirm` called best-effort on every profile-page load to self-heal once the link is clicked. Admin-driven edits (phone or email) sync directly, trusted, no challenge — same as account creation. Also: phone-only accounts (the common Parent case) got zero notice their account exists — now emits an unconditional onboarding SMS via the existing (previously unused) fan-out job; new `app/core/phone.py` Ghana-format normalizer applied to every guardian/staff phone write; switched the active SMS provider to Arkesel (`ArkeselSmsProvider`, precedence over Hubtel, falls back to it if only Hubtel is configured); added "this is also your login" UI notes to the Profile phone/email fields and the Admin guardian/staff creation forms, so an Admin doesn't assume a phone/email typed there is just a contact record. See `docs/superpowers/specs/2026-07-12-auth-contact-info-fixes-design.md`. |
| 6 item 8 slice 2 — Appointment notifications + HTML email templates | ✅ Done | Second of the 4-PR initiative. Closed `appointments.cancel`'s zero-notification bug (now in-app + email + SMS, matching `create`/`respond`) and built this codebase's first HTML email infrastructure: `apps/api/app/integrations/email/templates/` (Jinja2 `Environment`, a shared `base.html` every content template extends) retrofits the two pre-existing plain-text-only jobs (lesson-plan-rejection, results-published) with HTML alongside their existing plain-text fallback, plus 3 new appointment email jobs. Two preference **directions** (not per-event-type): teacher-facing "appointment activity" (`create` + `cancel`) and parent-facing "appointment decided" (`respond`) — new `user_preferences.{email,sms}_on_appointment_{activity,decided}` columns (this codebase's first per-user SMS preferences) plus matching `schools.notification_defaults` toggles, same two-tier gate as lesson-plan-rejection. User design review caught two real issues after the first pass: brand colors were a generic guess instead of the project's actual `--brand`/`--accent-teal` tokens (now correct), and the header banner was "too much for an email" — replaced with a plain citrus-accent top border plus a proper footer (school name/address/contact email, and a "Manage email preferences" link into the recipient's own profile tab, since there's no real unsubscribe mechanism). Email body font is a system sans-serif stack, not the app's actual `next/font/google` webfont (unloadable in most email clients, Outlook especially) and not the PDF report card's Georgia serif. Drive-by fix: `email_on_results_published` existed as a column since the report-card-polish PR but was never exposed through `/me` — Parents had zero UI to opt out; now wired through alongside the new appointment prefs. `ProfilePage.tsx`'s `NotificationsTab` restructured from a hard `user.role === TEACHER` ternary to a per-role preference-row list (Parent previously saw "nothing to configure for your role yet"). See `docs/superpowers/specs/2026-07-12-appointment-notifications-design.md`. |
| 6 item 8 slice 3 — Leave request notifications | ✅ Done | Third of the 4-PR initiative. Wired the two already-reserved but never-referenced `NotificationKind`s (`LEAVE_REQUEST_SUBMITTED`/`_DECIDED`) into `LeaveRequestsService`: submitting a leave request fans out to every eligible approver — every Deputy Head of the requester's division plus every Admin, both simultaneously eligible (unlike lesson plans' staged Unit-Head-then-Deputy-Head chain) — via `resolve_audience()` merged across `StaffByDivisionAudience(roles=[DeputyHead])` and `AllAdminsAudience()`; each resolved approver gets its own in-app + email + SMS notification (per-recipient, not batched). Approving/rejecting notifies the requester, structurally identical to the appointments `respond` flow. Two new preference directions (`{email,sms}_on_leave_{activity,decided}`) — the first prefs `ProfilePage.tsx`'s `NotificationsTab` has ever shown Admin or Deputy Head (both previously fell through to "nothing to configure," despite being staff who can submit their own leave too). Cancel and substitute-assignment stay silent by explicit scope decision. Surfaced a real gap: the backend already lets Admin approve/reject leave, but no `/admin/leave` page exists in the frontend — only `/deputy-head/leave` and `/teacher/leave` do, so Admin's email CTA falls back to `/admin/staff` for now. Building a real `/admin/leave` page is tracked as a follow-up PR, planned last in this initiative (after attendance-absence notifications). See `docs/superpowers/specs/2026-07-12-leave-request-notifications-design.md`. |
| 6 item 8 slice 4 — Attendance absence notifications | ✅ Done | Fourth of the originally-scoped 4-PR initiative. `AttendanceService.upsert_session` is session-based — it deletes and re-inserts an entire class roster on every save, no per-student mark/correct method exists — so the core problem this PR solves is dedup: fetches the previous session's records into a `{student_id: status}` map before the delete, and only a genuine status *transition into* `"Absent"` notifies (a same-day resubmission that leaves an already-absent student unchanged stays silent; `Absent → Present → Absent` genuinely re-notifies). Recipient resolution follows the results-published/fee-reminder precedent: primary guardian only, batched — a guardian with two newly-absent children in the same session save gets one combined email + SMS, not two. `"Late"`/`"Excused"` stay silent; only `"Absent"` triggers. Single-direction (parent-facing only) — one preference pair, `{email,sms}_on_attendance_absent`. The one deliberate default flip in this initiative: `schools.notification_defaults.on_attendance_absent` defaults to `false`, not `true` like every other toggle — attendance is marked daily for potentially every student, a materially higher volume and more sensitive category than the occasional appointments/leave/results events, so a school opts in explicitly rather than this firing unannounced. See `docs/superpowers/specs/2026-07-12-attendance-absence-notifications-design.md`. |
| 6 item 8 slice 5 — Admin leave management page | ✅ Done | Fifth and last of the initiative, a follow-up PR tracked from slice 3. Built `/admin/leave` by reusing `LeaveRequestList` unchanged (no role-specific logic in it — `GET /leave-requests` already scopes Admin-sees-everyone vs Deputy-Head-sees-own-division server-side, so the frontend just calls the same endpoint with no extra params) plus one new optional `scopeDescription` prop for the empty-state copy. Scope grew mid-PR: researching the Admin gap surfaced a bigger one — none of Admin, Deputy Head, or Teacher's sidebar nav configs (`apps/web/src/features/shell/role-config.ts`) had a "Leave" entry at all, so `/deputy-head/leave` and `/teacher/leave` (both already fully built) had been completely unreachable through the UI since they shipped. Fixed all three roles' nav in this PR. Verified end-to-end in a real browser across all three roles with live seeded data — nav entries render, Admin sees both divisions' requests, Deputy Head (JHS) correctly sees only their own, Teacher's submit-and-view flow works, zero console errors. |

## Roadmap & audits

Persistent reference docs — pick up when you have the time, not in any forced order:

| Doc | Purpose |
|---|---|
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | **Start here** if onboarding a new collaborator or a fresh Claude.ai session — single self-contained brief covering features, roles, gaps, next steps |
| [`docs/COMPETITIVE-ANALYSIS.md`](docs/COMPETITIVE-ANALYSIS.md) | Where we win/lose vs SchoolPad et al; missing features ranked by market impact |
| [`docs/FEATURE-ENHANCEMENTS.md`](docs/FEATURE-ENHANCEMENTS.md) | Depth gaps in features we already shipped (leave, student/staff profiles, exams, report cards, etc.) |
| [`docs/CODEBASE-AUDIT.md`](docs/CODEBASE-AUDIT.md) | Technical-debt items (DB indexes, drizzle relations, loading states, caching, etc.) |
| [`docs/ENGINEERING-CONVENTIONS.md`](docs/ENGINEERING-CONVENTIONS.md) | Coding principles future PRs follow — the load-bearing rules also live in [`CLAUDE.md`](CLAUDE.md) |
| [`docs/PRICING.md`](docs/PRICING.md) | Pricing model, scaling math, negotiation room |
| [`docs/implementation-spec.md`](docs/implementation-spec.md#next-up--commercial-roadmap-drives-sales-readiness) | Engineering-side punch list of the commercial roadmap items |

## Commercial roadmap (drives sales-readiness)

Sales-driven priorities benchmarked against SchoolPad, iSchool, TopHat, ClassEra and other Ghana / West Africa school ERPs. Full reasoning in [`docs/COMPETITIVE-ANALYSIS.md`](docs/COMPETITIVE-ANALYSIS.md); engineering-side punch list in [`docs/implementation-spec.md`](docs/implementation-spec.md#next-up--commercial-roadmap-drives-sales-readiness); pricing model in [`docs/PRICING.md`](docs/PRICING.md).

**Track 1 — close the critical sales-blocking gaps (next 2 months)**

- **Fee management** — tracking core, the parent-facing balance view, and weekly SMS reminders are all done — see Phase 5 Slices 1–3 in the Development Phases table. Online pay-now was evaluated and explicitly declined (parents pay at the school, not through the app) — not on this roadmap.
- **SMS gateway** — scaffolding done in Phase 3 (`SmsProvider` interface, `sms_log` table, Inngest fan-out job, `GET /sms-log`); the real `HubtelSmsProvider` client shipped in Phase 5 Slice 3, config-gated pending an actual Hubtel account + sender-ID registration (falls back to the stub until then). Remaining: per-school credit pool + fallback from in-app notifications when users haven't logged in.

**Track 2 — kill remaining objections + unblock scale (months 2–4)**

- **Timetable management** (~30–40 h) — period structure, teacher/class/room slotting, conflict detection, substitute overrides on staff leave.
- **Multi-tenancy — remaining piece** — the original ask here (`school_id` resolved per-session instead of a hardcoded constant) is already done on the backend: `apps/api/app/core/deps.py`'s `get_current_school_id` reads `school_id` off the JWT per-request, and every table + route is already scoped by it. `apps/web/src/lib/school.ts`'s `getCurrentSchoolId()` is unused dead code left over from the single-school constant era. What's still missing for school #2: an onboarding flow to create a new `schools` row + first Admin, and (if needed) a school-switcher for any future cross-school user.

**Track 3 — differentiation + Ghana-specific value (months 4–6)**

- **Mobile PWA** (~30–50 h) — manifest + service worker + offline reads + web push (Android). Differentiates vs SchoolPad's "must be online".
- **WhatsApp Business API** (~20–30 h) — mirror SMS triggers + two-way replies + bulk audience messaging. Replaces ad-hoc WhatsApp groups with structured comms.

**Track 4 — post-PMF, opportunistic**

- AI-assisted lesson plans + report comments (~25–35 h) — premium tier
- Online admissions (~25–35 h) — seasonal but real
- Library / inventory (~30–40 h) — fills the gaps
- Parent-teacher chat (~25–40 h) — differentiator

**Track 5 — defer indefinitely unless a customer asks**

- HR / payroll, hostel, transport, cafeteria, video class, online CBT, alumni.

## Other potential improvements (engineering-only, no commercial urgency)

Two items from this list were achieved as side effects of the Strategy A migration rather than as standalone work: a JSON API surface with bearer-token auth (that's what `apps/api/` is now) and moving off Server-Action-only mutations (`actions/` files are now thin wrappers around the FastAPI client, not the business logic itself).

- **Hubtel SMS integration** — `SmsProvider` interface + stub + `sms_log` table exist; needs a Hubtel account + sender-ID before the real client can be built.
- **Capacitor shell** — App Store / Play Store presence with the existing codebase + push notifications (provider TBD now that Firebase Cloud Messaging is off the table post-migration).
- **Offline cache** — last-fetched view stays visible offline. Wait until users complain.
- **Component-level tests / broader E2E coverage** — the Playwright suite is currently disabled (see the Development Phases table); Vitest now covers pure-logic units only, no DB-integration layer.
- **Activate Sentry + Logfire for real** — the instrumentation itself is already wired (`apps/api/app/core/observability.py`: FastAPI + SQLAlchemy tracing, PII scrubbing for names/phones/secrets) and runs as a silent no-op until credentials exist. Provisioning real Sentry/Logfire projects and wiring the keys via Railway env vars is a later-phase task, not a code change.
- **Uptime monitoring (UptimeRobot or similar)** — nothing currently pings `apps/api`'s `/health` or the Next.js app from outside; add external monitors once there's a production URL worth watching.
- **Umami analytics** — lightweight, privacy-friendly product analytics; not wired anywhere yet. Worth adding once there's an actual question ("which reports do admins open most?") rather than speculatively.
- **Proper email templates + a transactional provider** — `apps/api/app/integrations/email/provider.py` supports HTML (`EmailMessage.html`), but every current sender (e.g. the lesson-plan-rejection job) only builds a plain-text f-string body. Needs real HTML templates, and probably a move off raw SMTP to Resend (or similar) once send volume or deliverability tracking starts to matter.
