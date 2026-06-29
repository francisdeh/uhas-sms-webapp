# UHAS Basic School SMS — Backend Technical Architecture

**Version:** 1.1
**Date:** June 2026
**Prepared by:** Simplifyd Labs Ltd
**Stack:** FastAPI · Supabase · Inngest · Hubtel · uv
**Companions:** FRD v2.0, Data Model v2.0

---

## 1. Architecture Overview

UHAS SMS moves from an all-in-Next.js design (business logic in Server Actions) to a separated architecture: a **Next.js frontend** talking over HTTP to a **FastAPI backend**, with **Supabase** providing managed Postgres, Auth, and Storage, **Inngest** running background jobs, and **Hubtel** sending SMS.

### 1.1 Component Map

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js 16 + React + Tailwind + shadcn/ui | UI, SSR, calls the API; no business logic |
| Backend | FastAPI (Python), managed with **uv** | All business logic, validation, authorization, orchestration |
| Database | Supabase Postgres | Relational store + Row-Level Security |
| Auth | Supabase Auth | Identity, JWT issuance (email for staff, phone for parents) |
| Storage | Supabase Storage | Photos (public) + documents (signed URLs) |
| Background jobs | Inngest | Async + scheduled work (report generation, SMS fan-out, reminders) |
| SMS | Hubtel | Outbound SMS to parents |
| Email | Provider-agnostic (Resend/SendGrid/SMTP) | Transactional email |
| Hosting | Railway | FastAPI service + Next.js app |

### 1.2 Request Flow

1. Browser calls a FastAPI endpoint with the Supabase JWT in the `Authorization` header.
2. FastAPI middleware verifies the JWT (Supabase JWKS), extracts user id, role, school_id.
3. A dependency builds a request context (current user, role, scope) and enforces coarse authorization.
4. The router calls a **service** function holding the business logic.
5. The service uses a **repository** to read/write Postgres; RLS is the backstop.
6. Side effects (SMS, email, report generation) are dispatched to **Inngest**, not run inline.
7. A typed Pydantic response model is returned; the frontend renders it.

---

## 2. Why FastAPI Here

- It is the team's strongest tool — velocity and debugging confidence compound over the project.
- Pydantic gives typed request/response contracts that mirror the old `ActionResult` discipline.
- Clean fit for the compute-heavier work coming (report card PDFs, analytics, document parsing, future AI).
- A real HTTP API surface is reusable by a future mobile app or partner-school clients — something Server Actions could not offer.

> **Trade-off acknowledged:** the current 142 Vitest + 8 Playwright tests target Server Actions and will not carry over directly. The testing strategy (§8) rebuilds coverage with `pytest` at the service and API layers.

---

## 3. Tooling — uv

The project uses **uv** for Python environment and dependency management.

- `pyproject.toml` is the single source of dependency truth; `uv.lock` pins the resolved set.
- `uv sync` provisions the environment; `uv run ...` executes commands (e.g. `uv run uvicorn`, `uv run pytest`, `uv run alembic`).
- CI uses `uv` for install + lint + test; the Railway build installs via `uv` as well.
- No `pip`, `poetry`, or `requirements.txt` as the primary workflow.

---

## 4. Project Structure

A **feature-first** layout. `core/` holds cross-cutting concerns; **every feature is fully self-contained** — its model, schema, router, service, repository, and jobs all live together in the feature folder. This mirrors the existing feature-module convention so the mental map carries over from the current codebase.

```
app/
├── main.py                      # FastAPI app, router registration, middleware
│
├── core/                        # Cross-cutting concerns ONLY
│   ├── config.py                # Settings (env, secrets via pydantic-settings)
│   ├── db.py                    # SQLAlchemy engine + session factory
│   ├── security.py              # JWT verification, Supabase JWKS, password rules
│   ├── deps.py                  # Shared dependencies: get_current_user, require_role, scope guards
│   ├── audit.py                 # writeAuditLog equivalent
│   ├── errors.py                # Error envelopes (the ActionResult equivalent)
│   ├── logging.py               # Structured logging, request ids
│   └── inngest.py               # Inngest client setup
│
├── integrations/                # Third-party clients (shared across features)
│   ├── sms/                     # SmsProvider interface + Hubtel implementation
│   ├── email/                   # Email provider interface
│   ├── storage.py               # Supabase Storage helpers (public + signed URLs)
│   └── payments/                # PaymentProvider interface (only if online pay confirmed)
│
└── features/                    # One self-contained folder per domain
    └── <domain>/
        ├── model.py             # ORM model(s) for this domain's tables
        ├── schema.py            # Pydantic request/response models
        ├── repository.py        # ALL DB access for this domain
        ├── service.py           # Business logic — the heart
        ├── router.py            # HTTP endpoints
        ├── jobs/                # Inngest functions for this domain (folder, not a single file)
        │   ├── __init__.py      # Registers all jobs in this domain with the Inngest client
        │   ├── report_generate.py
        │   ├── report_email.py
        │   └── ...              # One file per logical job
        └── tests/               # pytest for this domain (unit + integration)
```

### 4.1 Feature self-containment rule

A feature folder owns everything about its domain. Jobs live in a **`jobs/` subfolder** inside the feature, not a single `jobs.py` and not a top-level `app/jobs/`. Each job is its own file — `features/fees/jobs/fee_reminder.py`, `features/reports/jobs/report_generate.py`, `features/leave/jobs/attendance_sync.py`. The `jobs/__init__.py` registers all of the domain's functions with the Inngest client so `main.py` just imports each feature and everything wires up automatically.

This keeps large domains (like `reports`, which has multiple distinct async flows) from accumulating into one long file, and makes it obvious at a glance how many background jobs a feature owns.

### 4.2 Layer responsibilities

| Layer | May do | May NOT do |
|---|---|---|
| `router.py` | Parse input, call a service, shape response | Contain business rules or touch the DB |
| `service.py` | Own business rules, orchestrate, call repositories, dispatch jobs, write audit | Embed raw SQL / direct ORM queries |
| `repository.py` | All DB reads/writes for the domain (ORM/SQL) | Contain business rules |
| `model.py` | Define ORM tables for the domain | — |
| `schema.py` | Define Pydantic contracts | — |
| `jobs.py` | Define the domain's Inngest functions | Be imported by routers for inline work |

### 4.3 Domains

Mirror the FRD modules: `auth`, `students`, `staff`, `guardians`, `classes`, `subjects`, `attendance`, `leave`, `exams`, `reports`, `lesson_plans`, `schemes`, `scheme_of_learning`, `assignments`, `promotions`, `announcements`, `calendar`, `appointments`, `notifications`, `audit`, `settings`, `fees`, `sms`.

---

## 5. Authentication & Authorization

### 5.1 JWT verification

- Supabase issues a JWT on login. FastAPI verifies it against Supabase's JWKS (public keys), checking signature, expiry, and audience.
- Claims extracted: `sub` (auth user id), `role`, `school_id`, `linked_id` — role and school_id are written into JWT `app_metadata` at sign-up/login.
- `core/deps.py:get_current_user` returns the request context or raises `401`.

### 5.2 Role & scope enforcement

This replaces the Next.js `proxy.ts` route guard. Authorization is layered:

- `require_role(*roles)` gates endpoints by role (e.g. only Admin can publish results).
- **Scope guards** narrow further: a teacher may only touch assigned classes; a parent only linked students; a Deputy Head only their division; an Accountant only fee tables.
- **RLS in Postgres** is the final backstop — even a service bug cannot cross tenant or scope boundaries.

### 5.3 Parent phone login *(pending confirmation with Mawuli)*

- Parents sign in by phone (E.164) through Supabase phone auth.
- Phone is normalised on write; the guardian record is keyed to the auth identity.
- Staff and admins continue with email login; the same JWT pipeline serves both.

---

## 6. Service & Repository Pattern

Business logic lives in **service** functions; **all** DB access lives in **repositories**. This is the direct heir to the old Server Action discipline.

- **Routers are thin:** parse input (Pydantic), call a service, shape the response.
- **Services own rules:** score weight computation, promotion materialisation, fee balance updates, review-chain transitions. Services call repositories — never raw queries.
- **Repositories own data access:** every read/write for the domain goes through the repository, so SQL/ORM is isolated and testable.
- **Every sensitive mutation** calls `core/audit.py`, exactly as today.
- **Services return typed results;** exceptions map to consistent HTTP error envelopes via `core/errors.py`.

### 6.1 ORM choice

| Option | Pros | Cons |
|---|---|---|
| **SQLAlchemy 2.0 + Alembic** | Mature, powerful, first-class migrations; the Python standard | More verbose |
| SQLModel | Pydantic-native, concise, pairs with FastAPI | Younger; still rides on SQLAlchemy + Alembic for migrations |

**Recommendation:** SQLAlchemy 2.0 with Alembic for migrations, run via `uv run alembic`. The existing Drizzle migrations become the baseline schema; Alembic owns migrations from cutover forward. Repositories encapsulate the ORM so a future change stays contained.

---

## 7. Background Jobs (Inngest)

Anything slow, scheduled, or fan-out runs in Inngest, keeping API requests fast. Each job is defined in the **owning feature's `jobs.py`**.

| Job | Lives in | Trigger | Work |
|---|---|---|---|
| Report card generation | `features/reports/jobs/report_generate.py` | On results publish / admin request | Render per-student PDFs, store to Supabase Storage |
| Batch report print | `features/reports/jobs/report_batch.py` | Admin action | Generate all class PDFs, bundle, notify when ready |
| SMS fan-out | `features/sms/jobs/sms_fanout.py` | Absence / results / announcement | Queue Hubtel sends per recipient, log each |
| Fee reminders | `features/fees/jobs/fee_reminder.py` | Scheduled (weekly) + on demand | Find outstanding balances, send parent SMS |
| Email-to-parent report | `features/reports/jobs/report_email.py` | On results publish | Attach PDF, send to guardian |
| Soft-delete cleanup | `features/<owner>/jobs/cleanup.py` | Scheduled (daily) | Purge items past 30-day TTL |
| Leave→attendance sync | `features/leave/jobs/attendance_sync.py` | On leave approval | Mark staff attendance on covered days |

> Jobs run with a **service-role** connection (RLS-bypassing) and must validate tenancy explicitly in code.

> **Why Inngest over ARQ + Redis:** ARQ is Python-native and faster for high-throughput work, but requires managing Redis as another service and has no built-in dev UI. Inngest's local dev server — which lets you trigger and inspect any job without Redis or a cloud account — is a significant advantage for a solo developer. The job volume here (a school management system) is well within Inngest's free tier. Revisit ARQ + Redis if you ever need sub-second job latency or thousands of invocations per minute; migrating is straightforward as the business logic in job functions stays identical.

---

## 8. Integrations

### 8.1 Hubtel SMS
- A single `SmsProvider` interface in `integrations/sms/`; Hubtel is the first implementation, so a swap later is a one-file change.
- Send path: service → `features/sms` job → Hubtel API → write `sms_log` row → update status on delivery callback.
- Sender ID/branding registered with Hubtel; numbers validated to E.164 before send.
- Every message logged with category and cost for accounting and the audit trail.

### 8.2 Payment gateway *(only if online payment confirmed)*
- Abstracted behind a `PaymentProvider` interface in `integrations/payments/` (Paystack or Hubtel's payment API).
- Inbound webhooks verified, stored in `payment_gateway_events`, reconciled idempotently against `fee_payments`.
- If the school keeps payment at the bursar, this stays dormant; fee tracking still works.

### 8.3 Storage & email
- Supabase Storage: photos public-read, documents via signed URLs (mirrors the current Firebase pattern).
- Email kept provider-agnostic behind one interface, as today.

---

## 9. OpenAPI → Next.js Type Generation

FastAPI generates an OpenAPI schema automatically at `/openapi.json`. Rather than manually maintaining TypeScript types on the frontend, the Next.js app generates them from this spec at build time — keeping the frontend contract always in sync with the backend.

### Tooling

**`openapi-typescript`** generates TypeScript types from the OpenAPI spec. It is the lightest-touch option: it produces a single `schema.d.ts` file with all request/response types inferred from the Pydantic models, no runtime dependency.

```bash
# In the Next.js project
pnpm add -D openapi-typescript

# package.json script
"generate:types": "openapi-typescript http://localhost:8000/openapi.json -o src/types/api.d.ts"
```

### Workflow

```
FastAPI Pydantic schema.py
         ↓  (auto)
/openapi.json endpoint
         ↓  (openapi-typescript)
src/types/api.d.ts          ← consumed by the Next.js frontend
```

- Run `pnpm generate:types` locally after any backend schema change.
- In CI: the pipeline starts the FastAPI server, runs the generator, then checks that the output is committed and up to date (`git diff --exit-code src/types/api.d.ts`). A drift in types fails the build.
- In production builds on Railway/Vercel: types are pre-committed; no live backend call needed at build time.

### Usage in Next.js

```typescript
import type { components } from '@/types/api'

type Student = components['schemas']['StudentResponse']
type CreateStudentRequest = components['schemas']['CreateStudentRequest']
```

This eliminates an entire class of frontend bugs where the UI assumes a field that the backend has renamed or removed. Any breaking change to a Pydantic schema surfaces immediately as a TypeScript error in the Next.js app.

---

## 10. Frontend Data Fetching — TanStack Query

The Next.js frontend uses **TanStack Query** (`@tanstack/react-query`) for all API calls to the FastAPI backend. This replaces the Server Action call pattern from the previous build.

### Why TanStack Query here

Moving to a real HTTP API means the frontend needs to manage server state explicitly — loading, error, caching, refetching, and mutation states. TanStack Query handles all of this cleanly and pairs naturally with the generated OpenAPI types from §9.

- **Caching and background refetching** — attendance lists, class rosters, and dashboards stay fresh without manual refresh logic.
- **Mutation lifecycle** — `useMutation` gives consistent loading/error/success states for score entry, attendance marking, plan submissions, etc., replacing the old `isPending` + `ActionResult` pattern.
- **Optimistic updates** — mark attendance instantly in the UI, reconcile with the server in the background. Important for the teacher UX where speed matters.
- **Query invalidation** — after a mutation succeeds, invalidate the relevant queries so the UI reflects the change without a full page reload.
- **Devtools** — TanStack Query Devtools shows the full cache state in development, which makes debugging much easier alongside the Inngest dev server.

### Setup

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

```typescript
// app/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 minutes default
      retry: 1,
    },
  },
})

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

### API client layer

A thin typed API client sits between TanStack Query and the fetch calls, using the generated types from `src/types/api.d.ts`. This keeps query functions clean and ensures every call is typed end-to-end.

```typescript
// src/lib/api/client.ts
import type { components } from '@/types/api'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getSupabaseToken()}`,
      ...init?.headers,
    },
  })
  if (!res.ok) throw await res.json()
  return res.json()
}

export const api = {
  students: {
    list: (classId: string) =>
      apiFetch<components['schemas']['StudentListResponse']>(`/students?class_id=${classId}`),
    create: (body: components['schemas']['CreateStudentRequest']) =>
      apiFetch<components['schemas']['StudentResponse']>('/students', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  // ... one namespace per feature domain
}
```

### Query and mutation conventions

Each feature domain has its own query file co-located with the feature's UI:

```
src/features/
└── attendance/
    ├── queries.ts       # useQuery hooks for this domain
    ├── mutations.ts     # useMutation hooks for this domain
    └── components/
```

```typescript
// src/features/attendance/queries.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'

export const attendanceKeys = {
  all: ['attendance'] as const,
  session: (classId: string, date: string) =>
    [...attendanceKeys.all, classId, date] as const,
}

export function useAttendanceSession(classId: string, date: string) {
  return useQuery({
    queryKey: attendanceKeys.session(classId, date),
    queryFn: () => api.attendance.getSession(classId, date),
  })
}
```

```typescript
// src/features/attendance/mutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { attendanceKeys } from './queries'

export function useMarkAttendance(classId: string, date: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: api.attendance.markSession,
    onSuccess: () => {
      // Invalidate so the session view refreshes
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.session(classId, date),
      })
    },
  })
}
```

### Query key conventions

Query keys are defined as constants in each domain's `queries.ts` — not scattered as inline strings — so invalidation after mutations is reliable and refactorable.

### Stale time guidance by domain

| Domain | Stale time | Reason |
|---|---|---|
| Class rosters / student lists | 5–10 min | Changes rarely mid-session |
| Attendance session | 30 sec | Teacher may have multiple tabs open |
| Dashboard counts | 2 min | Near-real-time feel for admin |
| Scores / results | 5 min | Entry is deliberate; no race conditions |
| Announcements / notifications | 1 min | Users expect near-real-time |
| Settings / config | 10 min | Rarely changes |

### Server Components vs TanStack Query

Next.js App Router Server Components can fetch directly on the server (no TanStack Query needed). Use them for initial page loads of mostly-static data (settings pages, class lists). Use TanStack Query for anything interactive — attendance marking, score entry, live notification counts, mutations. The two patterns coexist cleanly: a Server Component fetches the initial data, passes it as `initialData` to TanStack Query, and the client takes over for subsequent interactions.

---

## 11. Local Development with Supabase

Every developer runs the full stack locally — FastAPI, Next.js, Postgres, Auth, and Storage — using the **Supabase CLI** to provide a local Supabase instance. No shared remote database for development.

### Prerequisites

```bash
# Supabase CLI
brew install supabase/tap/supabase   # macOS
# or via npm: npx supabase

# uv (Python)
curl -LsSf https://astral.sh/uv/install.sh | sh

# pnpm (Node)
npm install -g pnpm
```

### Local Supabase setup

```bash
# In the project root
supabase init                  # Creates supabase/ config folder (one-time)
supabase start                 # Starts local Postgres, Auth, Storage, Studio

# Runs on:
# Postgres:      postgresql://postgres:postgres@localhost:54322/postgres
# Auth:          http://localhost:54321
# Storage:       http://localhost:54321/storage/v1
# Studio UI:     http://localhost:54323
# Inbucket (email):  http://localhost:54324
```

### Database migrations

```bash
# Apply existing migrations to local Postgres
supabase db reset              # Drops and recreates from all migrations (clean state)

# Create a new migration after model changes
uv run alembic revision --autogenerate -m "add fee_items table"
uv run alembic upgrade head

# Push migrations to local Supabase
supabase db push               # or let db reset pick them up
```

### Environment files

```
# .env.local (Next.js — not committed)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase start output>
NEXT_PUBLIC_API_URL=http://localhost:8000

# .env (FastAPI — not committed)
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
INNGEST_DEV=true               # Runs Inngest in dev mode (no cloud account needed)
```

> Local Supabase keys are printed by `supabase start` and are safe to share within the team since they only work against the local instance.

### Starting the full local stack

```bash
# Terminal 1 — Supabase
supabase start

# Terminal 2 — FastAPI backend
uv run uvicorn app.main:app --reload --port 8000

# Terminal 3 — Inngest dev server
uv run inngest dev             # or npx inngest-cli dev

# Terminal 4 — Next.js frontend
pnpm dev
```

### Seeding local data

```bash
# Run the seed script against the local DB
uv run python scripts/seed.py

# Or via Supabase CLI seed file
supabase db seed               # Applies supabase/seed.sql
```

A `seed.sql` (or Python seed script) should create:
- One school (UHAS Basic School) with all settings
- The 11 Common Core subjects
- All 13 classes (KG 1 – JHS 3)
- 5–10 staff accounts across roles (Admin, Deputy Head, Teacher, Accountant)
- 20–30 students with guardian links
- One academic year and term
- The Term 3 2025/2026 calendar events

### RLS in local development

Local Supabase runs RLS exactly as production does. This means:
- **Service-role key** (FastAPI's `SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS for trusted backend operations.
- **Anon key** (Next.js client) is subject to RLS — good for testing that policies work.
- To test RLS policies directly: connect to the local Postgres via Studio at `http://localhost:54323` and use the SQL editor.

### Inngest in local development

When `INNGEST_DEV=true`, Inngest runs in dev mode and can be triggered manually from the Inngest Dev Server UI (`http://localhost:8288`), without needing a cloud account or internet connection. This lets you trigger and inspect jobs (report generation, fee reminders, SMS fan-out) locally before deploying.

### CI environment

CI (GitHub Actions) mirrors local exactly:
- `supabase start` spins up local Supabase as a service container.
- `uv sync` installs dependencies.
- `uv run alembic upgrade head` applies migrations.
- `uv run python scripts/seed.py` seeds test data.
- `uv run pytest` runs the full suite.
- `pnpm generate:types` generates types and checks for drift.

---

Rebuilds the coverage lost when Server Actions are retired. Tests live in each feature's `tests/` folder; run via `uv run pytest`.

- **Unit tests:** service-layer logic — score weighting, grade computation, promotion rules, fee balance math, review-chain transitions.
- **Integration tests:** API endpoints against a real Postgres (Docker), covering auth, scope enforcement, and RLS behaviour.
- **Contract tests:** Pydantic schemas guarantee request/response shape for the frontend.
- **RLS tests:** explicit cases proving a parent cannot read another learner, a teacher cannot write another class, an accountant cannot read scores.
- **E2E (optional, later):** Playwright against the running frontend + API for critical flows (login, attendance, score entry, fee payment).

---

## 12. Testing Strategy

Rebuilds the coverage lost when Server Actions are retired. Tests live in each feature's `tests/` folder; run via `uv run pytest`.

- **Unit tests:** service-layer logic — score weighting, grade computation, promotion rules, fee balance math, review-chain transitions.
- **Integration tests:** API endpoints against a real Postgres (local Supabase via `supabase start`), covering auth, scope enforcement, and RLS behaviour.
- **Contract tests:** Pydantic schemas guarantee request/response shape for the frontend; OpenAPI drift check runs in CI.
- **RLS tests:** explicit cases proving a parent cannot read another learner, a teacher cannot write another class, an accountant cannot read scores.
- **E2E (optional, later):** Playwright against the running frontend + API for critical flows (login, attendance, score entry, fee payment).
- **Load tests:** Locust, run post-launch against staging — see the Migration & Execution Plan §15.

---

## 13. Migration Posture (summary)

Detailed sequencing lives in the Migration Plan; the architecture assumes this posture:

1. Stand up FastAPI skeleton (uv) + Supabase project; port the schema as the Alembic baseline.
2. Migrate auth first (Supabase Auth, JWT pipeline, phone login for parents) — the riskiest piece, done in isolation.
3. Port domains one at a time: `model` + `repository` + `service` + `router` + `schema` + `tests`, repointing the frontend per domain.
4. Cut storage over to Supabase; wire Inngest; integrate Hubtel.
5. Add the new domains (fees, SMS, full SoL) once the core is stable.

---

## 14. Non-Functional Targets (backend)

- Stateless API behind Railway; horizontal scale if needed (the school's load is light — ~60 concurrent peak).
- p95 endpoint latency under 300ms for reads, under 800ms for writes excluding async work.
- All slow/fan-out work off the request path via Inngest.
- Structured logging + request ids; errors mapped to consistent envelopes.
- Secrets in Railway/Supabase env; service-role keys never shipped to the client.

---

## 15. Error Tracking & Observability

### Sentry

Both the FastAPI backend and Next.js frontend use **Sentry** for error tracking.

```bash
# Backend
uv add sentry-sdk[fastapi]

# Frontend
pnpm add @sentry/nextjs
```

**FastAPI setup** — automatic exception capture, request context, and performance tracing:

```python
# app/main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

sentry_sdk.init(
    dsn=settings.SENTRY_DSN,
    integrations=[FastApiIntegration(), SqlalchemyIntegration()],
    traces_sample_rate=0.2,
    environment=settings.ENV,
    before_send=scrub_pii,   # Strip student names, phone numbers, fee data
)
```

**Inngest jobs** — wrap job handlers so failed background jobs appear in Sentry with full context:

```python
# core/inngest.py
def with_sentry(fn):
    async def wrapper(ctx, step):
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("job", fn.__name__)
            try:
                return await fn(ctx, step)
            except Exception as e:
                sentry_sdk.capture_exception(e)
                raise
    return wrapper
```

**PII scrubbing** — always strip sensitive data before it leaves the process:

```python
def scrub_pii(event, hint):
    # Remove student names, phone numbers, fee amounts from Sentry payloads
    if "request" in event:
        event["request"].pop("data", None)
    return event
```

**Next.js** — `@sentry/nextjs` instruments Server Components, client-side errors, and API routes automatically via `sentry.client.config.ts` / `sentry.server.config.ts`.

### Logfire (recommended alongside Sentry)

**Logfire** is Pydantic's observability tool, purpose-built for FastAPI + SQLAlchemy. It complements Sentry: Sentry catches errors; Logfire gives you request traces, slow query detection, and Pydantic validation error visibility.

```bash
uv add logfire[fastapi,sqlalchemy]
```

```python
# app/main.py
import logfire
logfire.configure()
logfire.instrument_fastapi(app)
logfire.instrument_sqlalchemy(engine)
```

Two lines of instrumentation gives you a trace for every request showing which SQL queries ran, how long they took, and any validation errors — invaluable when debugging slow attendance loads or report generation.

### Summary

| Tool | Covers | Purpose |
|---|---|---|
| Sentry | FastAPI + Next.js + Inngest jobs | Error capture, alerting |
| Logfire | FastAPI + SQLAlchemy | Request traces, slow queries, validation errors |

---

## 16. Additional Recommendations

### Zod (Next.js runtime validation)

TypeScript types from `src/types/api.d.ts` disappear at runtime. Zod validates API responses at the boundary so malformed data from the backend causes a clear error rather than a silent UI bug:

```bash
pnpm add zod
```

Use Zod schemas in TanStack Query's `select` option or in the API client layer to parse and validate responses. Pairs with `openapi-zod-client` if you want Zod schemas auto-generated from the OpenAPI spec alongside the TypeScript types.

### Dependabot / Renovate

A school system running for years needs automated dependency updates. Add a `renovate.json` or `.github/dependabot.yml` from day one — it creates PRs for security patches and version bumps, which you can merge on a schedule (e.g. weekly). Renovate is more configurable (can group updates, auto-merge patch versions); Dependabot is zero-config on GitHub. Either is fine.

### `pytest-asyncio` + `httpx`

For testing async FastAPI endpoints — name them explicitly so they're in the project from the start:

```bash
uv add --dev pytest pytest-asyncio httpx
```

`httpx` provides an `AsyncClient` that hits FastAPI endpoints in tests without a running server. `pytest-asyncio` handles the async test runner.

### `ruff` for linting and formatting

`ruff` replaces `flake8` + `black` + `isort` in a single fast tool. Add it to the project and CI from day one:

```bash
uv add --dev ruff
uv run ruff check .
uv run ruff format .
```

---

## 17. Monorepo Structure

Both the FastAPI backend and Next.js frontend live in a single repository. This keeps the OpenAPI type generation pipeline, shared tooling config, CI, and Railway deployment in one place.

```
uhas-sms/
├── .github/
│   └── workflows/
│       ├── ci.yml               # Full CI pipeline (lint, test, type check, type drift)
│       └── deploy.yml           # Railway deploy on merge to main
│
├── apps/
│   ├── api/                     # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── core/
│   │   │   ├── integrations/
│   │   │   └── features/
│   │   ├── tests/
│   │   ├── alembic/
│   │   ├── alembic.ini
│   │   ├── pyproject.toml       # uv manages this
│   │   └── .env                 # not committed
│   │
│   └── web/                     # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   ├── features/
│       │   ├── lib/
│       │   │   └── api/
│       │   │       └── client.ts
│       │   └── types/
│       │       └── api.d.ts     # generated — do not edit manually
│       ├── package.json
│       ├── next.config.ts
│       └── .env.local           # not committed
│
├── supabase/                    # Supabase CLI project (shared by both apps)
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql                 # Local dev seed data
│
├── scripts/
│   ├── generate-types.sh        # Runs openapi-typescript against the live API
│   ├── check-types-drift.sh     # Used by pre-commit hook
│   └── seed.py                  # Python seed script for local dev
│
├── .pre-commit-config.yaml      # Pre-commit hooks for both apps
├── railway.toml                 # Railway monorepo deployment config
├── .gitignore
└── README.md
```

### Why this layout

- `apps/api` and `apps/web` are independent deployable units — each has its own lockfile, toolchain, and Railway service, but they share the repo, the `supabase/` config, CI, and the pre-commit config.
- `supabase/` at the root is shared — both the backend (Alembic migrations) and the Supabase CLI (`supabase start`, `supabase db reset`) reference the same project.
- `scripts/` at the root is callable from CI and pre-commit without knowing which app it belongs to.

---

## 18. Railway Deployment

Railway treats each app as a separate **service** within one **project**. The monorepo is connected once; each service specifies its root directory and build command.

### `railway.toml`

```toml
[[services]]
  name = "api"
  source = "apps/api"
  buildCommand = "uv sync --frozen"
  startCommand = "uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT"

[[services]]
  name = "web"
  source = "apps/web"
  buildCommand = "pnpm install --frozen-lockfile && pnpm build"
  startCommand = "pnpm start"
```

### Services

| Service | Source | Notes |
|---|---|---|
| `api` | `apps/api` | FastAPI; Railway auto-assigns PORT |
| `web` | `apps/web` | Next.js; set `NEXT_PUBLIC_API_URL` to the `api` Railway URL |
| Inngest | External (managed) | No Railway service needed |
| Supabase | External (managed) | No Railway service needed |

### Environment variables

**`api` service:**
```
DATABASE_URL=<supabase pooler URL>
SUPABASE_URL=<project URL>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SENTRY_DSN=<backend DSN>
HUBTEL_CLIENT_ID=<>
HUBTEL_CLIENT_SECRET=<>
HUBTEL_SENDER_ID=<>
INNGEST_EVENT_KEY=<>
INNGEST_SIGNING_KEY=<>
LOGFIRE_TOKEN=<>
ENV=production
```

**`web` service:**
```
NEXT_PUBLIC_SUPABASE_URL=<project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
NEXT_PUBLIC_API_URL=<railway api service URL>
SENTRY_DSN=<frontend DSN>
SENTRY_AUTH_TOKEN=<for source maps upload>
```

### Deploy on merge to main

Railway auto-deploys on push to `main` per service. For tighter control — deploy only after CI passes — trigger from GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: ci          # Only runs if the ci job passes
    steps:
      - uses: actions/checkout@v4
      - name: Deploy API
        run: npx @railway/cli up --service api
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
      - name: Deploy Web
        run: npx @railway/cli up --service web
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 19. Pre-commit Hooks

A single `.pre-commit-config.yaml` at the repo root covers both apps. Hooks fire based on which files changed — Python hooks only on `apps/api/**`, Node hooks only on `apps/web/**`.

### Install

```bash
# From repo root — pre-commit installed via uv in apps/api
cd apps/api && uv add --dev pre-commit && cd ../..

# Install hooks into .git (run once per clone)
uv run --directory apps/api pre-commit install
```

### `.pre-commit-config.yaml`

```yaml
repos:
  # ── Python (apps/api) ─────────────────────────────────────────
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.4
    hooks:
      - id: ruff
        name: ruff lint (api)
        args: [--fix]
        files: ^apps/api/
      - id: ruff-format
        name: ruff format (api)
        files: ^apps/api/

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.10.0
    hooks:
      - id: mypy
        name: mypy (api)
        files: ^apps/api/
        additional_dependencies:
          - sqlalchemy[mypy]
          - pydantic

  # ── Node / Next.js (apps/web) ─────────────────────────────────
  - repo: local
    hooks:
      - id: eslint
        name: ESLint (web)
        language: node
        entry: pnpm --filter web lint
        files: ^apps/web/.*\.(ts|tsx|js|jsx)$
        pass_filenames: false

      - id: typescript
        name: TypeScript check (web)
        language: node
        entry: pnpm --filter web tsc --noEmit
        files: ^apps/web/.*\.(ts|tsx)$
        pass_filenames: false

  # ── OpenAPI type drift ─────────────────────────────────────────
  - repo: local
    hooks:
      - id: openapi-types-drift
        name: OpenAPI types drift check
        language: system
        entry: bash scripts/check-types-drift.sh
        files: ^apps/api/app/features/.*/schema\.py$
        pass_filenames: false

  # ── General ───────────────────────────────────────────────────
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-merge-conflict
      - id: check-added-large-files
        args: [--maxkb=500]
      - id: no-commit-to-branch
        args: [--branch, main]     # Force PRs — no direct commits to main
```

### OpenAPI type drift script

The `openapi-types-drift` hook fires when any `schema.py` changes. It regenerates `api.d.ts` and fails the commit if the file is out of date — catching the case where a Pydantic schema changes but the frontend types are not regenerated.

```bash
# scripts/check-types-drift.sh
#!/usr/bin/env bash
set -e

echo "Checking OpenAPI type drift..."

# Start the API briefly
cd apps/api
uv run uvicorn app.main:app --port 8001 &
API_PID=$!
sleep 3

cd ../..

# Regenerate types
pnpm --filter web generate:types

# Fail if api.d.ts changed
if ! git diff --exit-code apps/web/src/types/api.d.ts; then
  echo ""
  echo "❌ api.d.ts is out of date."
  echo "   Run: pnpm --filter web generate:types"
  echo "   Then commit the updated file."
  kill $API_PID
  exit 1
fi

kill $API_PID
echo "✅ Types are in sync"
```

### What each hook catches

| Hook | Catches |
|---|---|
| `ruff` | Python lint errors; auto-fixes where possible |
| `ruff-format` | Python formatting (replaces black) |
| `mypy` | Python type errors in service/schema/model files |
| `eslint` | TypeScript/React lint errors in the Next.js app |
| `typescript` | TypeScript type errors across the whole frontend |
| `openapi-types-drift` | Frontend types out of sync with backend Pydantic schemas |
| `no-commit-to-branch` | Prevents direct commits to `main` — forces PRs |
| `check-added-large-files` | Blocks accidental commits of PDFs, images, binaries |

### Bypassing when needed

```bash
# Skip all hooks (use sparingly — WIP commits only)
git commit --no-verify -m "wip"

# Skip a specific hook
SKIP=mypy git commit -m "wip: types to follow"
```

---

*End of Backend Technical Architecture.*
