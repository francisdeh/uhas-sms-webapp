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
| Profile page completion | 🚧 In progress | Save Changes (display name + phone), Notification preferences, and self-service account deactivation are now real (persist / take effect); photo upload + password change already were. Self-deactivation reuses the admin ban-and-flag mechanism, blocks Admins (403), audit-logs it, and signs the user out. Remaining UI-only stubs: 2FA and Active Sessions. Full punch list in [docs/implementation-spec.md](docs/implementation-spec.md#next-up--profile-page-completion). |
| Admin Settings page | ✅ Done | `/admin/settings` (Identity / Calendar / Grading / Communication / Security / Branding tabs) turned out to already be fully built from earlier work — an audit found every tab real and wired to the `schools` row, not the stale pre-migration stub the spec assumed. Remaining gap was narrower: `grading_bands`/`score_weights` were correctly consumed by score computation server-side already, but the score-entry live preview and the report-card/PDF grading-key legend still hardcoded the GES defaults — now both read the school's real resolved bands/weights. `session_timeout_minutes` was removed outright (unenforceable — Supabase Auth controls session expiry, not this app); `password_min_length`/`force_password_change_on_first_login` are now read-only in the UI since neither is wired to real enforcement yet. Part of Phase 3.5. |
| Drop JHS class streams | ✅ Done | School runs one class per level — no streams. Renamed `class-jhs1a/2a/3a` → `class-jhs1/2/3` and `"JHS 1A/2A/3A"` → `"JHS 1/2/3"` across seed + tests + UI. Deleted the now-dead `stripSuffix`/`streamSuffix` helpers and the three stream-specific tests; tightened the JHS-3-graduates check from `startsWith("JHS 3")` to `=== "JHS 3"`. |
| Real report-card PDF rendering | ✅ Done | `GET /students/{id}/report-card/pdf` renders the existing report-card template (Jinja2 port of `ReportCard.tsx`) to real PDF bytes via WeasyPrint, cached in Supabase Storage keyed by a content-hash of the assembled data (publish status doesn't actually lock scores/remarks, so caching couldn't key off that). `apps/api` now builds via its own `Dockerfile` (WeasyPrint's system libraries) instead of the `railpack` builder — Railway prefers a service's Dockerfile automatically, no `railway.toml` changes needed. Batch/bulk printing remains separate, deferred work. Part of Phase 3.5. |
| Rate-limiting audit | ✅ Done | No login/OTP endpoint exists in FastAPI at all — Supabase Auth handles that client-side — so the original "protect login" framing didn't apply; every route requires a verified JWT except `/health`. Added `slowapi`: a global 300/min-per-user default plus a stricter 10/min limit on the report-card PDF endpoint (the one route with a real cost profile). Keyed by authenticated user id from the JWT, not client IP — sidesteps `uvicorn` not being configured to trust Railway's `X-Forwarded-For`. In-memory storage today (correct for the current single Railway instance); `REDIS_URL` is wired for whenever `apps/api` scales to multiple replicas. Part of Phase 3.5. |

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

- **Fee management** (~40–60 h) — fee structures, term invoicing, Paystack pay-now (MoMo + card + bank), receipts, bursaries, collection reporting. Single biggest revenue lever; without it, every conversation against SchoolPad ends with "does it handle fees?".
- **SMS gateway** (~10–15 h remaining) — scaffolding done in Phase 3 (`SmsProvider` interface, `sms_log` table, Inngest fan-out job, `GET /sms-log`); the real Hubtel client is still a stub pending an account + sender-ID registration. Remaining work: real client + per-school credit pool + fallback from in-app notifications when users haven't logged in.

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
