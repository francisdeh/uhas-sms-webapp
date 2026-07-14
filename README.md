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

Full narrative for each row (the "why" behind every deliverable) lives in [`docs/CHANGELOG.md`](docs/CHANGELOG.md), newest first. This table is a slim status index only.

| Phase | Status | Summary |
|---|---|---|
| 0 — Foundation | ✅ Done | DB schema, Firebase emulator, mock fixtures, middleware, folder structure. |
| 1 — Auth & User Management | ✅ Done | Login, role routing, password flows, admin user management, dashboard shell, session-expiry modal. |
| 2a — Student Records | ✅ Done | Student list, registration form, deactivate/reactivate, division + status filters. |
| 2b — Student Detail & ID Card | ✅ Done | Student detail view, edit, class transfer, printable ID card. |
| 2c — Staff Management | ✅ Done | Staff list, registration, role assignment, detail/edit/deactivate. |
| 2d — Classes & Subjects | ✅ Done | Class + subject lists/create, class detail with teacher assignment + roster. |
| 3 — Attendance | ✅ Done | Student + staff attendance, leave requests, parent calendar view, live dashboard stats. |
| 3.5 — Model Reconciliation | ✅ Done | Division split, Unit Head flag, multi-teacher classes, UHAS staff ID, school-specific grading scale. |
| 4a — Score Entry | ✅ Done | Score columns + grade/position/aggregate helpers; admin exam management; teacher score-entry grid. |
| 4b — Report Card | ✅ Done | Server-rendered, printable report card matching the school template; parent + admin routes. |
| 4c — Workflow | ✅ Done | Class-teacher remarks + Head of School review workflow before publishing report cards. |
| 5a — Lesson Plans | ✅ Done | Teacher CRUD + Unit Head → Deputy Head approval chain with reject/comment. |
| 5b — Schemes of Work / Learning | ✅ Done | Structured or uploaded scheme submissions, Head of School acknowledgement queue. |
| 5c — Assignments | ✅ Done | Teacher CRUD + publish; parent aggregated view across children's classes. |
| 6a — Announcements | ✅ Done | Scoped to school/division/class; posted by Admin/Deputy Head, seen by Parents. |
| 6b — Appointments | ✅ Done | Parent booking + teacher confirm/decline inbox. |
| 7a — Reports dashboards | ✅ Done | Scoped stats dashboards for Admin, Deputy Head, Teacher. |
| 7b — PSC Report | ✅ Done | Printable Population & Staff Census report. |
| 7c — Academic Calendar | ✅ Done | Admin-managed calendar events, read-only views for other roles. |
| 5.7 — Student Promotion | ✅ Done | Year-end promotion workflow materializing real enrollment rows + audit log. |
| DB Cutover (mock → Drizzle) | ✅ Done, later superseded | Removed mock-data mode, moved every action/query onto real Postgres via Drizzle (later superseded). |
| Audit log viewer | ✅ Done | Admin-only audit log with filters, pagination, before/after diff view. |
| File uploads (originally Firebase Storage) | ✅ Done, backend later swapped | Reusable upload/download components for photos and documents (later moved to Supabase Storage). |
| Theme default + UX polish | ✅ Done | UHAS brand palette as default theme; one-click "mark all present" on attendance. |
| 8 — Testing (layers 1 + 2) | ✅ Done | Vitest unit + integration test suite (128 tests) against a real Postgres. |
| CI workflow | ✅ Done (superseded — see below) | Original apps/web-only CI pipeline (superseded by the two-job web+api workflow). |
| 8 — Testing (layer 3) | ⚠️ Disabled since Strategy A migration | Playwright E2E suite, currently disabled pending re-port to the new stack. |
| Outbound email | ✅ Done — moved to Python | Email sending ported from Node/nodemailer to Python. |
| Strategy A Migration (Phases 0–3) | ✅ Done | FastAPI + SQLAlchemy/Alembic + Supabase replaced Drizzle/Server Actions and Firebase entirely. |
| Profile page completion | ✅ Done | Notification prefs, self-deactivation, active sessions, 2FA/TOTP. |
| Admin Settings page | ✅ Done | Identity/Calendar/Grading/Communication/Security/Branding tabs wired to real school config. |
| Drop JHS class streams | ✅ Done | Simplified JHS to one class per level, no streams. |
| Real report-card PDF rendering | ✅ Done | WeasyPrint-rendered, Supabase-Storage-cached PDF report cards. |
| Rate-limiting audit | ✅ Done | Global + endpoint-specific rate limits via slowapi, keyed by authenticated user. |
| 5 Slice 1 — Fee tracking core | ✅ Done | Fee items, learner fees, payments; Accountant role + dashboard. |
| 5 Slice 2 — Parent fee view | ✅ Done | Read-only parent-facing fee balances + payment history. |
| 5 Slice 3 — Fee reminder SMS | ✅ Done | Weekly SMS + in-app reminders for overdue fees. |
| 6 item 1 — Student profile depth | ✅ Done | Medical info + student documents, properly access-gated. |
| 6 item 2 — Audit log filters | ✅ Done | User/table/target filters + actor list + CSV export. |
| 6 item 7 — "Built by SimplifydLabs" attribution | ✅ Done | Shared attribution component on login + sidebar footers. |
| 6 item 4 — Staff profile depth | ✅ Done | Hire date, subject expertise, qualifications, staff documents. |
| 6 item 3 — Leave management depth | ✅ Done | Leave balances, documents, substitute cover; fixed a division-scope leak. |
| 6 item 5 — Report card polish | ✅ Done | KG developmental observations, conduct ratings, class averages, batch PDF printing, results-published emails. |
| 6 item 8 slice 1 — Auth contact-info fixes | ✅ Done | Fixed phone/email desync between app tables and Supabase Auth; onboarding SMS; Arkesel SMS provider. |
| 6 item 8 slice 2 — Appointment notifications + HTML email templates | ✅ Done | First branded HTML email infra; appointment cancel notifications. |
| 6 item 8 slice 3 — Leave request notifications | ✅ Done | In-app/email/SMS notifications to approvers + requester. |
| 6 item 8 slice 4 — Attendance absence notifications | ✅ Done | Parent-facing absence notifications, dedup'd against re-submission. |
| 6 item 8 slice 5 — Admin leave management page | ✅ Done | Built /admin/leave; fixed missing "Leave" nav entry across 3 roles. |
| Pre-go-live gap audit — tier 1 cleanup | ✅ Done | Wired 2 orphaned pages, deleted confirmed-dead code, deduped role-style maps. |
| Account emails: real provider + branded invite/reset/change | ✅ Done | Resend/Mailpit provider; branded invite/reset/email-change flows replacing Supabase's own mailer. |
| Action-button + page-layout consistency pass | ✅ Done | Canonical brand/destructive button variants app-wide; layout fixes; Select + Tabs primitive bugs fixed. |
| Tier 4 follow-on bug sweep | ✅ Done | Staff email-edit confirmed already safe; UUID leaks fixed via new breadcrumb-label mechanism + one-offs; Profile "Documents" card labeled; staff phone-login restricted to Parents; broken self-service photo upload removed for initials-only avatars; Settings page buttons fixed. |
| Academic-year / term management deep-dive | ✅ Done | Removed the hardcoded academic-year array (was blocking any new year without a code deploy); added an explicit Prepare/Activate rollover workflow on the Calendar tab; `current_term` is now auto-picked from real term dates with a manual override; fixed the parent dashboard's hardcoded Sept–Aug date range and exam creation's always-Term-1 default. |
| 6 item 6 — First-time-setup onboarding checklist | ✅ Done | Persistent, auto-hiding Admin dashboard widget with 5 live-computed setup checks (identity, grading, calendar, classes, staff); no stored flag, disappears once all pass. |
| Parent-facing fee receipts | ✅ Done | Parent fees page now downloads the Accountant's uploaded proof-of-payment file(s) per payment, reversing a prior deliberate exclusion; drive-by fixes brought the whole Accountant section (Card wrapper, StatCards, roster section header, redundant back-link) in line with the rest of the app's list/detail page conventions. |
| Dashboard data enrichment/validation | ✅ Done | Fixed a real bug zeroing out attendance stats app-wide (Present/Late casing); wired already-computed lesson-plan/attendance data into Admin + Deputy Head Overviews; eliminated Teacher dashboard's N+1 class lookup with a new `classTeacherId` filter; fixed Parent's capped announcement count and single-child-only attendance %. |
| Teacher classes page N+1 fix | ✅ Done | Repointed `/teacher/classes` to the same `classTeacherId` filter, closing the follow-up left open by the dashboard-enrichment PR. |
| Search navigation revisit | ✅ Done | Removed dead Announcements search branch; fixed broken student/staff search-result navigation; new read-only Teacher student & Deputy Head staff detail + list pages (with sidebar nav); search expanded to fee items/lesson plans/schemes with `?focus=` deep-linking into the existing review pages. |
| Audit findings: cleanup + missing edit UIs | ✅ Done | Deleted 4 confirmed-dead backend routes (standalone guardian CRUD, singular student-guardian lookup, standalone enrollment/learner-fee GETs); added 5 missing edit dialogs (Exam, Class, Fee Item, Subject, Guardian contact-info) for domains that already had working `PATCH` endpoints + unused hooks; fixed a real notification UX bug (mark-all-on-open) and a genuine "Mark all as read" button bug (wrong event prop for the Base UI menu primitive) found during verification; centralized a `TERMS` constant across 6 hardcoded "Term 1/2/3" sites; fixed DeputyHead's student-profile page showing edit/guardian actions the backend has always reserved for Admin only. |
| Audit findings: promotions + attendance revisit | ✅ Done | Wired up attendance's fully-backend-supported but frontend-unreachable Excused status, fixing a real data-corruption bug that silently downgraded existing Excused records to Absent; surfaced promotions' already-computed-but-dropped class-teacher names on Admin/DeputyHead detail pages and the DH queue list; found and fixed a pre-existing crash in DeputyHead's promotion review page (decisions response-shape mismatch) that had never been exercised until this PR's manual verification created the first live submission in the local dev database. Zero backend changes — both features were already fully supported server-side. |

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
