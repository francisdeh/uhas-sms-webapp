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
- Schema is in `src/db/schema.ts`. Run `npm run db:push` to apply changes.

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
| DeputyHead | `/deputy-head` | One division (JHS/Primary/KG) |
| HOD | `/hod` | One department (JHS subject area) |
| Teacher | `/teacher` | Own classes only |
| Parent | `/parent` | Own child(ren) only |

---

## School Structure

- **KG:** KG 1, KG 2
- **Primary:** Primary 1–6
- **JHS:** JHS 1–3
- Lesson plan approval chain: Teacher → HOD (JHS only) → Deputy Head → (Admin if escalated)

---

## Coding Conventions

- **No comments** unless the WHY is non-obvious. Well-named identifiers are self-documenting.
- **No speculative abstractions.** Don't build helpers or utilities until you need them in 3+ places.
- **TypeScript strict mode is on.** No `any`, no `@ts-ignore` unless absolutely unavoidable and explained.
- **Tailwind for all styling.** No CSS modules, no inline styles. Use `cn()` from `src/lib/utils.ts` for conditional classes.
- **shadcn/ui for all UI primitives** — inputs, buttons, labels, dialogs, selects, etc. Components live in `src/components/ui/`. Add missing ones with `npx shadcn@latest add <name> -y`. Never use raw HTML form elements in feature components.
- **Zod for all form validation.** Every form uses `react-hook-form` + `zodResolver` + a Zod schema. Pass error messages as objects (`{ message: "..." }`) not bare strings.
- **Sonner for all toasts.** Import from `sonner` — `toast.success()`, `toast.error()`.
- **All destructive actions need a confirmation dialog** before executing.
- **Audit-log admin mutations** (score overrides, student edits, role changes) via the `audit_log` table.

---

## GES Grading Scale

Used for score calculation in `features/exams/`:

| Score | Grade | Interpretation |
|---|---|---|
| 80–100 | 1 | Excellent |
| 70–79 | 2 | Very Good |
| 60–69 | 3 | Good |
| 55–59 | 4 | Credit |
| 50–54 | 5 | Credit |
| 45–49 | 6 | Pass |
| 40–44 | 7 | Pass |
| 35–39 | 8 | Fail |
| 0–34 | 9 | Fail |

Score formula: `totalScore = (classScore / 30) * 30 + (examScore / 70) * 70` (class score 30%, exam score 70%).

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
