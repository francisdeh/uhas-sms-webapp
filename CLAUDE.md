# CLAUDE.md — UHAS SMS Project Context

This file gives Claude context about the project so every session starts with full understanding. Read it before doing anything.

---

## What This Is

A School Management System (SMS) for UHAS Basic School, Ghana, split across a Next.js frontend and a FastAPI backend: student/staff administration, attendance, examinations, lesson plan approval workflows, background jobs (SMS, email, report generation), and parent communication.

It is a real production system being built for a real school. Code quality, correctness, and security matter.

## Monorepo layout

```
uhas-sms/
├── apps/
│   ├── web/         # Next.js frontend — UI only. No DB access, no domain mutations.
│   └── api/         # FastAPI backend — owns all data access + mutations + jobs.
├── supabase/        # Supabase CLI project (Auth/Storage/Postgres config)
├── docs/            # Persistent reference docs (HANDOVER, conventions, audits, …)
├── v2/              # Migration plan set — Strategy A target architecture (now largely realized)
└── railway.toml     # Multi-service Railway config
```

`apps/web/src/...` below is the Next.js app; `apps/api/` has its own conventions documented in [apps/api/README.md](apps/api/README.md) and isn't described in detail here. The Strategy A migration (Next.js+Drizzle+Firebase → Next.js+FastAPI+Supabase) is **Phases 0–3 complete**: FastAPI/SQLAlchemy/Alembic is the sole data-access + mutation path, Drizzle and Server-Action mutations are fully decommissioned, and Supabase has replaced Firebase for both Auth and Storage. See [v2/UHAS_Migration_Execution_Plan.md](v2/UHAS_Migration_Execution_Plan.md) for phase-by-phase detail.

---

## Current State

See `README.md`'s Development Phases table for feature history and `docs/implementation-spec.md` for the full feature plan.

There is no mock-data mode anymore — `USE_MOCK_DATA` and `apps/web/src/lib/mock/` were removed when the app was cut over to a real database (pre-Strategy-A). Every read and mutation goes through the FastAPI backend today. Local demo data comes from two independent seed scripts — `pnpm seed:supabase` (Supabase Auth accounts) and `cd apps/api && uv run python -m app.scripts.seed` (business data: school, staff, students, classes, everything else) — see the root README's Getting Started.

---

## Tooling

- **Node package manager: pnpm.** The workspace lockfile lives at the repo root (`pnpm-lock.yaml`) and `apps/web/package.json` pins the version via `packageManager: pnpm@…`. Never use `npm` or `npx` in commands — `pnpm` / `pnpm exec` / `pnpm dlx` instead. `node_modules` is hoisted at the repo root.
- **Python package manager: uv.** Lockfile in `apps/api/uv.lock`. Always prefix `uv` commands with `unset VIRTUAL_ENV;` to avoid conflicts with the user's pyenv-set VIRTUAL_ENV.

---

## Architecture Rules

### Feature-Based Modules
All domain code lives in `apps/web/src/features/<name>/`. Never dump feature-specific components into `apps/web/src/components/`. The `apps/web/src/components/` folder is for truly shared, reusable UI primitives only.

Each feature folder contains whichever of these it needs — most have `hooks/` + `components/`; a handful with cookie-only or non-domain concerns (`shell`, `uploads`) keep a thin `actions/` instead:
```
apps/web/src/features/<name>/
├── components/   # UI components for this domain
├── hooks/        # TanStack Query hooks (useQuery/useMutation) calling lib/api/browser.ts
├── queries/      # async functions calling lib/api/server.ts, for Server Component reads
├── actions/      # Server Actions — ONLY for things that aren't domain-data mutations
│                 # (setting a cookie, minting a signed URL). Domain mutations do not
│                 # belong here; see "Server vs Client" below.
└── types.ts      # TypeScript types for this domain
```

### Server vs Client
- **Default to Server Components.** Only add `"use client"` when you need interactivity, browser APIs, or hooks.
- **All domain data access — reads and mutations — goes through the FastAPI backend (`apps/api/`), never through Drizzle, a DB driver, or a Next.js API route handler.** There are two typed clients in `apps/web/src/lib/api/`: `server.ts`'s `getApi()` (Server Components — reads the session server-side) and `browser.ts`'s `api` (Client Components — reads the session client-side). Both wrap `client.ts`, which is generated against the FastAPI OpenAPI schema (`src/types/api.d.ts` — regenerate with `pnpm generate:api-types` after any backend schema/route change).
- **Server Component reads**: call `getApi()` directly in the page/component, or via a `features/<name>/queries/` helper.
- **Client-side mutations**: TanStack Query `useMutation` hooks in `features/<name>/hooks/`, calling `api.<domain>.<method>()` from `lib/api/browser.ts`. On error, catch `ApiError` (from `@/lib/api/client`) and `toast.error(err instanceof ApiError ? err.message : "…")`; on success, `queryClient.invalidateQueries(...)`. This is the dominant pattern — most features have no `actions/` folder at all.
- **True Server Actions** (`"use server"` in `features/<name>/actions/`) are now reserved for things that genuinely belong on the Next.js side and aren't FastAPI calls: setting a cookie (e.g. the academic-year switcher), or minting a Supabase Storage signed URL for a download click. `ActionResult<T>` (`apps/web/src/lib/action-result.ts`) is still the return shape for these.

### Database
- **Next.js has zero direct database access.** All of it lives in `apps/api/` — SQLAlchemy 2.0 (async) + Alembic, talking to Supabase Postgres. See [apps/api/README.md](apps/api/README.md) for the FastAPI-side conventions (model.py / repository.py / service.py / router.py per feature, hand-written Alembic migrations, no autogenerate).
- Every table still includes `schoolId`/`school_id` for multi-tenant scoping — enforced server-side via `apps/api/app/core/deps.py`'s `get_current_school_id`, which resolves it from the JWT per-request (not a hardcoded constant).
- If a Next.js change looks like it needs a schema change, it needs a PR against `apps/api/`, not `apps/web/`.

### Auth
- **Supabase Auth** for identity. Staff sign in with email + password; parents can sign in with email + password OR phone + OTP.
- Sessions are managed by `@supabase/ssr` via httpOnly cookies — Next.js never hand-rolls session cookies.
- Role + linked_id come from the JWT's **`app_metadata`** (server-set, trusted). Never read role from `user_metadata` (user-writable). FastAPI verifies the same JWT independently on every request (`apps/api/app/core/security.py`) — Next.js's proxy check is a routing convenience, not the security boundary.
- `apps/web/src/proxy.ts` enforces role-based routing on every request and refreshes near-expired sessions automatically.
- Locally: Supabase CLI stack via `supabase start` (Auth on `127.0.0.1:54321`, Postgres on `54322`). Local SMS uses `test_otp` from `supabase/config.toml` — no real provider needed.
- Client helpers in `apps/web/src/lib/supabase/` — `client.ts` (browser), `server.ts` (Server Components / Actions), `middleware.ts` (proxy), `admin.ts` (service-role, for admin user-management).

---

## Role System

| Role | Dashboard Route | Key Scope |
|---|---|---|
| Admin | `/admin` | Full school access |
| DeputyHead | `/deputy-head` | One division (KG / Lower Primary / Upper Primary / JHS) |
| Teacher | `/teacher` | Own classes only |
| Parent | `/parent` | Own child(ren) only |

**Unit Head** is not a separate login role — it's a flag (`isUnitHead`) on a staff/teacher record, with `unitHeadOf` storing the division they head. Unit Heads log in as Teachers and see additional sections in their dashboard (e.g. Department view, lesson-plan reviews for their unit). Unit Heads are subject to change — Admin/Deputy can toggle the flag.

---

## School Structure

- **KG:** KG 1, KG 2
- **Lower Primary:** Primary 1, 2, 3
- **Upper Primary:** Primary 4, 5, 6
- **JHS:** JHS 1, 2, 3
- Lesson plan approval chain: Teacher → Unit Head (where one exists for the division) → Deputy Head → (Admin if escalated)

---

## Coding Conventions

Full conventions in [docs/ENGINEERING-CONVENTIONS.md](docs/ENGINEERING-CONVENTIONS.md). Load-bearing rules:

### General style
- **No comments** unless the WHY is non-obvious. Well-named identifiers are self-documenting.
- **No speculative abstractions.** Don't build helpers or utilities until you need them in 3+ places.
- **TypeScript strict mode is on.** No `any`, no `@ts-ignore` unless absolutely unavoidable and explained.
- **Use exported constants for known unions** — `USER_ROLES`, `Division`, `LessonPlanStatus`, etc. Never compare against bare string literals.
- **Tailwind for all styling.** No CSS modules, no inline styles. Use `cn()` from `apps/web/src/lib/utils.ts` for conditional classes.
- **shadcn/ui for all UI primitives** — inputs, buttons, labels, dialogs, selects, etc. Components live in `apps/web/src/components/ui/`. Add missing ones with `pnpm dlx shadcn@latest add <name> -y`. Never use raw HTML form elements in feature components.
- **Zod for all form validation.** Every form uses `react-hook-form` + `zodResolver` + a Zod schema. Pass error messages as objects (`{ message: "..." }`) not bare strings.
- **Sonner for all toasts.** Import from `sonner` — `toast.success()`, `toast.error()`.

### Database (all of this applies to `apps/api/`, not `apps/web/` — see above)
- **Always filter by `school_id`**, resolved server-side from the JWT (`CurrentSchoolIdDep`) — every table is multi-tenant-anchored.
- **Index FK columns and filter-heavy columns** in the same migration that adds them. Postgres doesn't auto-index FKs.
- **Prefer SQLAlchemy relationships + eager loading (`selectinload`/`joinedload`) over manual joins.** One query beats four.
- **Migrations only, hand-written, no autogenerate.** `uv run alembic revision -m "…"` then hand-write the `op.*` calls, then `uv run alembic upgrade head`. SQL must be reviewable in the PR.
- **Soft-delete high-risk tables** (lesson plans, scores, assignments, schemes) with `deletedAt` rather than a hard delete.

### Server Actions & FastAPI mutations
- **Client-side mutations** (the common case — see "Server vs Client" above): catch `ApiError`, `toast.error()` on failure, `invalidateQueries()` on success. There's no `ActionResult` involved.
- **True Server Actions** (cookies, signed URLs — see above) still return `ActionResult<T>` (`apps/web/src/lib/action-result.ts`) — `{ success: true; ...data } | { success: false; error: string }`. Never throw from one; catch and return.
- **Audit-log sensitive mutations** (score overrides, student edits, role changes, promotion approvals, settings updates) on the FastAPI side, via `apps/api/app/features/audit/`.
- **Never log auth tokens or session cookies.** Decoded `uid` / `email` only.
- **Call `revalidatePath`** in any Server Component route after a mutation that changed data it reads (rare now — most mutations are client-side and rely on `invalidateQueries` instead).

### UI
- **Server Components by default.** Add `"use client"` only for interactivity / hooks / browser APIs.
- **`loading.tsx` + `error.tsx` on every data-fetching route.** The 4 role-dashboard routes are templates.
- **Memoize hot list/grid components** (50+ rows): `React.memo` on rows, `useCallback` for prop handlers.
- **All destructive actions need a confirmation dialog** before executing.
- **Theming**: two orthogonal axes on `<html>` — `class="dark"` (light/dark via `useTheme().setTheme()`) and `data-color-scheme="uhas"` (UHAS brand colours via `useTheme().setColorScheme()`). **UHAS is the default**: the root layout renders `<html data-color-scheme="uhas">` so the brand palette applies on first paint. Switching to `"default"` removes the attribute. Brand palette overrides live in `globals.css` under `:root[data-color-scheme="uhas"]`. Reference brand colours through Tailwind tokens (`bg-brand`, `text-accent-orange`) — never hardcode hex literals in components, or theme switching will skip them.
- **Mobile responsive**: every page-header row that pairs a title with an action button uses `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`. Wide tables wrap in `overflow-x-auto`. Report cards / PSC report use `overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0` to allow side-scroll on phones while keeping print layout intact.

### Quality
- **Don't commit secrets.** `.env.local`, `.env` (apps/api), service-account JSONs, Supabase service-role keys, SMTP passwords, Inngest signing keys all stay out of git.
- **CI must be green before merge.** Two jobs in `.github/workflows/ci.yml`: `web` (lint + tsc + Vitest + build) and `api` (ruff + mypy + pytest + Alembic-upgrade-from-scratch + OpenAPI/TS drift check). The Playwright E2E job exists but is currently disabled (`if: false`) — it still targets the pre-migration Firebase/Server-Action surface and hasn't been re-ported. Railway deploy is gated on the enabled jobs.

---

## Grading Scale (UHAS Basic School)

Used for score calculation in `features/exams/`. Bands and interpretations come from the school's official report card template:

| Score | Grade | Interpretation |
|---|---|---|
| 90–100 | 1 | Highest |
| 80–89 | 2 | Higher |
| 70–79 | 3 | High |
| 60–69 | 4 | High Average |
| 55–59 | 5 | Average |
| 50–54 | 6 | Lower Average |
| 40–49 | 7 | Low |
| 35–39 | 8 | Lower |
| 0–34 | 9 | Lowest |

**Aggregate** is computed BECE-style: sum of grade numbers across reported subjects (lower = better).

**Score components** (end-of-term): CAT 1, CAT 2, Group Work, Project Work, end-of-term exam. Weights live in school config (placeholder until finalised).

**Mid-term ranking**: raw mid-term exam score out of 100 (100%). No CAT components included for mid-term ranking.

---

## Key Files

| File | Purpose |
|---|---|
| `apps/api/app/features/<domain>/model.py` | SQLAlchemy ORM model per domain — schema source of truth, one file per feature, no single monolith |
| `apps/api/alembic/versions/` | Hand-written migrations, linear history |
| `apps/api/app/core/config.py` | FastAPI settings — every field has a working local default + a `description` |
| `apps/api/app/core/deps.py` | Auth/role FastAPI dependencies, incl. `get_current_school_id` (multi-tenant scoping) |
| `apps/web/src/lib/api/{server,browser,client}.ts` | Typed FastAPI client — `server.ts` for Server Components, `browser.ts` for Client Components, both wrapping `client.ts` |
| `apps/web/src/types/api.d.ts` | Generated from FastAPI's OpenAPI schema (`pnpm generate:api-types`) — do not hand-edit |
| `apps/web/src/proxy.ts` | Role-based routing enforcement (Next.js 16 renamed middleware → proxy) |
| `apps/web/src/lib/supabase/{client,server,middleware,admin}.ts` | Supabase client helpers per execution context |
| `apps/web/src/features/auth/queries/get-session-user.ts` | Resolves the current `SessionUser` via one call to FastAPI's `/me` |
| `apps/web/src/components/ui/` | shadcn UI primitives |
| `docs/implementation-spec.md` | Full feature spec and phase plan |
| `apps/web/scripts/seed-supabase-users.ts` | Seeds Supabase Auth with the 9 role-anchored test accounts — **auth only**; pair with `apps/api/app/scripts/seed/` for the `staff`/`schools`/`students` rows they're linked to |
| `apps/api/app/scripts/seed/` | Business-data seed script (reset-only) — one school, staff, students, classes, and every other domain's demo data |
| `supabase/config.toml` | Local Supabase CLI config (Auth providers, storage buckets, test_otp) |

---

## What NOT to Do

- Don't use Firestore — the database is PostgreSQL. The SRS mentioned Firestore but that decision was superseded, and Firebase itself (Auth + Storage) was later replaced by Supabase in the Strategy A migration.
- Don't add timetable features — explicitly deferred to a later phase.
- Don't add fee management, payroll, medical, or counselling features — out of MVP scope.
- Don't add a Next.js API route handler, and don't write Drizzle/raw-SQL DB access in `apps/web/` — all data access is a call through `apps/web/src/lib/api/{server,browser}.ts` to `apps/api/`. If it needs a new endpoint, add it in `apps/api/`.
- Don't add `"use client"` to layouts or pages that don't need it.
- Don't skip `school_id` filtering in any FastAPI query.
- The project uses **Tailwind v4**. Config lives in `apps/web/src/app/globals.css` via `@theme inline` — there is no `tailwind.config.ts`. Add new design tokens there, not in JS.
