# CLAUDE.md — UHAS SMS Project Context

This file gives Claude context about the project so every session starts with full understanding. Read it before doing anything.

---

## What This Is

A Next.js web app for UHAS Basic School, Ghana. It's a School Management System (SMS) covering: student/staff administration, attendance, examinations, lesson plan approval workflows, and parent communication.

It is a real production system being built for a real school. Code quality, correctness, and security matter.

---

## Current State

See `README.md` for phase progress and `docs/implementation-spec.md` for the full feature plan.

Most UI currently uses mock data (`USE_MOCK_DATA=true`). Real DB integration is introduced phase by phase.

---

## Architecture Rules

### Feature-Based Modules
All domain code lives in `src/features/<name>/`. Never dump feature-specific components into `src/components/`. The `src/components/` folder is for truly shared, reusable UI primitives only.

Each feature folder contains:
```
src/features/<name>/
├── components/   # UI components for this domain
├── actions/      # Next.js Server Actions (mutations)
├── queries/      # Server-side query functions
└── types.ts      # TypeScript types for this domain
```

### Server vs Client
- **Default to Server Components.** Only add `"use client"` when you need interactivity, browser APIs, or hooks.
- **Mutations = Server Actions** in `features/<name>/actions/`. Never use API route handlers for mutations.
- **Complex client data fetching = TanStack Query** (`useQuery`, `useMutation`). For simple server-rendered data, just fetch in Server Components directly.

### Database
- Drizzle ORM + Neon PostgreSQL in production.
- Locally: Docker PostgreSQL 16 on port 5432.
- All tables include `schoolId` for multi-tenant scoping — every query must filter by `schoolId`.
- Schema is in `src/db/schema.ts`. After editing it, run `npm run db:generate` to emit a new migration file in `drizzle/`, then `npm run db:migrate` to apply it. `db:push` is **not** used — migrations are the only path to a schema change, so the SQL is reviewable in PRs and the test/E2E DBs stay in sync with prod via the same files.

### Auth
- Firebase Authentication for identity.
- Session stored as httpOnly cookies set by login Server Action.
- `src/proxy.ts` enforces role-based routing on every request.
- Locally: Firebase Auth Emulator on port 9099.

### Mock Data
- `USE_MOCK_DATA=true` in `.env.local` makes Server Actions and queries return fixtures from `src/lib/mock/`.
- Remove mock data module-by-module as real DB integration is wired up per phase.
- Never import mock files directly in UI components — they should only be used inside `actions/` and `queries/`.

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
- **Tailwind for all styling.** No CSS modules, no inline styles. Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **shadcn/ui for all UI primitives** — inputs, buttons, labels, dialogs, selects, etc. Components live in `src/components/ui/`. Add missing ones with `npx shadcn@latest add <name> -y`. Never use raw HTML form elements in feature components.
- **Zod for all form validation.** Every form uses `react-hook-form` + `zodResolver` + a Zod schema. Pass error messages as objects (`{ message: "..." }`) not bare strings.
- **Sonner for all toasts.** Import from `sonner` — `toast.success()`, `toast.error()`.

### Database
- **Always filter by `schoolId`** via `getCurrentSchoolId()` — every table is multi-tenant-anchored.
- **Index FK columns and filter-heavy columns** in the same migration that adds them. Postgres doesn't auto-index FKs.
- **Prefer Drizzle relations + `with:` over manual joins.** Relations live in `src/db/schema.ts`. One query beats four.
- **Migrations only, no `db:push`.** `npm run db:generate` then `npm run db:migrate`. SQL must be reviewable in the PR.
- **Soft-delete high-risk tables** (lesson plans, scores, assignments, schemes) with `deletedAt` rather than `db.delete(...)`.

### Server Actions
- **Return `ActionResult<T>`** — `{ success: true; data?: T } | { success: false; error: string }`. Never throw from an action; catch and return.
- **Audit-log sensitive mutations** (score overrides, student edits, role changes, promotion approvals, settings updates) via `src/lib/audit-log.ts`.
- **Never log auth tokens or session cookies.** Decoded `uid` / `email` only.
- **Call `revalidatePath`** after data-mutating actions for routes that show the data.

### UI
- **Server Components by default.** Add `"use client"` only for interactivity / hooks / browser APIs.
- **`loading.tsx` + `error.tsx` on every data-fetching route.** The 4 role-dashboard routes are templates.
- **Memoize hot list/grid components** (50+ rows): `React.memo` on rows, `useCallback` for prop handlers.
- **All destructive actions need a confirmation dialog** before executing.
- **Theming**: two orthogonal axes on `<html>` — `class="dark"` (light/dark via `useTheme().setTheme()`) and `data-color-scheme="uhas"` (UHAS brand colours via `useTheme().setColorScheme()`). **UHAS is the default**: the root layout renders `<html data-color-scheme="uhas">` so the brand palette applies on first paint. Switching to `"default"` removes the attribute. Brand palette overrides live in `globals.css` under `:root[data-color-scheme="uhas"]`. Reference brand colours through Tailwind tokens (`bg-brand`, `text-accent-orange`) — never hardcode hex literals in components, or theme switching will skip them.
- **Mobile responsive**: every page-header row that pairs a title with an action button uses `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`. Wide tables wrap in `overflow-x-auto`. Report cards / PSC report use `overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0` to allow side-scroll on phones while keeping print layout intact.

### Quality
- **Don't commit secrets.** `.env.local`, service-account JSONs, Firebase keys, Neon URLs, App Passwords all stay out of git.
- **CI must be green before merge.** Lint + tsc + Vitest on every PR; E2E on `main` pushes. Railway deploy is gated on it.

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
| `src/db/schema.ts` | Single source of truth for all DB tables |
| `src/proxy.ts` | Role-based routing enforcement (Next.js 16 renamed middleware → proxy) |
| `src/lib/firebase.ts` | Firebase client init + emulator detection |
| `src/lib/firebase-admin.ts` | Firebase Admin SDK for server-side auth |
| `src/lib/mock/*.ts` | Fixture data (replaced phase by phase with real DB) |
| `src/components/ui/` | shadcn UI primitives |
| `docs/implementation-spec.md` | Full feature spec and phase plan |
| `scripts/seed-emulator-users.ts` | Seeds Firebase emulator with test users |

---

## What NOT to Do

- Don't use Firestore — the database is PostgreSQL. The SRS mentioned Firestore but that decision was superseded.
- Don't add timetable features — explicitly deferred to a later phase.
- Don't add fee management, payroll, medical, or counselling features — out of MVP scope.
- Don't create API route handlers for mutations — use Server Actions.
- Don't add `"use client"` to layouts or pages that don't need it.
- Don't skip `schoolId` filtering in any DB query.
- The project uses **Tailwind v4**. Config lives in `src/app/globals.css` via `@theme inline` — there is no `tailwind.config.ts`. Add new design tokens there, not in JS.
