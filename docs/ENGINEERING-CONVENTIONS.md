# Engineering Conventions

Working principles for the UHAS SMS codebase. These crystallize lessons from the [Codebase Audit](CODEBASE-AUDIT.md) — what we've fixed should not regress.

Treat this doc as load-bearing: PR reviews can cite it, AI assistants reading the repo will follow it. The hard rules are in [CLAUDE.md](../CLAUDE.md) at the project root.

Last reviewed: 2026-05-21.

---

## Database

### 1. Index FK columns and filter-heavy columns

Every new column that participates in a `WHERE` filter, `ORDER BY`, or foreign-key join needs an index — Postgres does not auto-index foreign keys. Add the index in the same migration that adds the column.

```ts
// New table:
export const myThings = pgTable(
  "my_things",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    schoolId: varchar("school_id", { length: 64 }).references(() => schools.id).notNull(),
    ownerId: varchar("owner_id", { length: 50 }).references(() => staff.id).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("my_things_school_status_idx").on(t.schoolId, t.status),
    index("my_things_owner_idx").on(t.ownerId),
  ]
);
```

For composite indexes, order columns by selectivity — most-selective first. The current pattern across the repo is `(schoolId, ...)` because most queries scope by school.

### 2. Prefer Drizzle relations + `with:` over manual joins

When you need joined data, use the relations in [src/db/schema.ts](../src/db/schema.ts) and the `with:` query syntax. One round-trip beats four.

```ts
// ✅ Good — one query
const plan = await db.query.lessonPlans.findFirst({
  where: eq(lessonPlans.id, id),
  with: { teacher: true, subject: true, class: true },
});

// ❌ Bad — four round-trips
const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, id) });
const teacher = await db.query.staff.findFirst({ where: eq(staff.id, plan.teacherId) });
const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, plan.subjectId) });
const cls = await db.query.classes.findFirst({ where: eq(classes.id, plan.classId) });
```

If a relation you need doesn't exist yet, add it to the `relations()` block in `schema.ts`. They're TS-only metadata — no migration needed.

### 3. Migrations only, no `db:push`

Schema changes go through `pnpm db:generate` (creates the migration file) and `pnpm db:migrate` (applies it). Never `db:push` — the SQL must be reviewable in the PR and applied identically across dev/test/prod.

### 3a. Primary keys are uuid; slug as secondary on entity tables

Every primary key in the schema is `uuid PRIMARY KEY DEFAULT gen_random_uuid()`. **Never** declare a varchar PK on a new table. The DB generates the UUID at insert time — feature code does not construct ids via template literals like `\`xxx-${Date.now()}\``.

Where the entity benefits from a human-readable identifier (URLs, audit logs, dropdowns), add a separate `slug` column:

```ts
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 50 }).notNull(),         // "STAFF-042"
  schoolId: uuid("school_id").references(() => schools.id).notNull(),
  // ...
}, (t) => [
  unique("staff_school_slug_unique").on(t.schoolId, t.slug),
]);
```

Tables that get a slug today: **schools, staff, students, guardians, classes, subjects**. Everything else (audit_log, notifications, enrollments, scores, exams, lesson_plans, schemes, assignments, attendance, promotions, etc.) uses the UUID alone.

`schools.slug` is globally unique; every other slug is unique-per-school.

**Slug generation** lives in the service layer — for sequential schemes like `STAFF-042`, query the highest existing slug for the prefix + increment. For human-set slugs (school slug `"uhas-basic"`), accept from the admin form.

**Upsert by natural key**, not by synthetic id. Patterns like "id = `session-${classId}-${date}`" don't work with uuid PKs. Query by `(classId, date)` and branch on existence:

```ts
const existing = await tx.query.attendanceSessions.findFirst({
  where: and(eq(attendanceSessions.classId, classId), eq(attendanceSessions.date, date)),
});
if (existing) { ... } else { ... }
```

**Seed fixtures** use `det(key)` from `src/lib/uuid.ts` — a deterministic sha256-derived UUID. Same `det("STAFF-001")` resolves to the same UUID across runs, machines, CI. Tests reference seed entities by slug + `det()`, never by uuid literal.

### 4. Always filter by `schoolId`

Every query must scope by `schoolId` via `getCurrentSchoolId()`. Even if there's only one school today, multi-tenancy is on the roadmap and untouched queries become silent leaks then.

```ts
// ✅
const rows = await db.query.students.findMany({
  where: eq(students.schoolId, await getCurrentSchoolId()),
});

// ❌
const rows = await db.query.students.findMany();
```

### 5. Soft delete high-risk tables

For tables where users can hard-delete via the UI (lesson plans, scores, assignments, schemes, etc.), add a `deletedAt` timestamp instead of `db.delete(...)`. Filter it out in queries.

Tables that only have `isActive: boolean` flags (staff, students) don't need this — deactivation is already non-destructive.

---

## TypeScript

### 6. No `any`, no `ts-ignore`, no `ts-expect-error`

When the compiler complains, the answer is to fix the types, not silence them. If a third-party library has weak types, write a typed wrapper in a `*.types.ts` file rather than `as any` at every call site.

The existing 162 occurrences are tracked in [CODEBASE-AUDIT.md §2](CODEBASE-AUDIT.md#2-162-any--ts-ignore--ts-expect-error-occurrences--3060-h-incremental). Don't add to them.

### 7. Use exported constants, not string literals, for known unions

```ts
// ✅
import { USER_ROLES, type UserRole } from "@/features/auth/types";
if (user.role === "Admin") { ... }   // ok, TypeScript checks the literal against UserRole
const adminRoles: UserRole[] = ["Admin"];

// ❌
function isAdmin(role: string) {
  return role === "Admin";   // role typed as string — TS can't help if "Admin" gets renamed
}
```

Same for `Division` (`KG | Lower Primary | Upper Primary | JHS`), `LessonPlanStatus`, etc.

### 8. Validate all form input with Zod

Every form goes through `react-hook-form` + `zodResolver(schema)`. Zod schemas live next to the form component or in `types.ts`. Errors as objects `{ message: "..." }`, never bare strings.

```ts
const schema = z.object({
  email: z.email({ message: "Enter a valid email" }),
  age: z.number().int().min(3, { message: "Must be at least 3" }),
});
```

---

## Mutations & Data Fetching (post-v2)

### 8. No new Server Actions — mutations go through FastAPI

As of Phase 1 PR #8, the v2 architecture supersedes the Next.js Server Action pattern:

| Operation | Mechanism |
|---|---|
| **Auth** (sign in/out, refresh, OTP verify, password reset) | Supabase client SDK directly — `supabase.auth.signInWithPassword()`, `signOut()`, `verifyOtp()`. No Server Action, no FastAPI hop. |
| **Initial page reads** | Server Components call FastAPI via `fetch()` with the JWT forwarded. No TanStack Query needed. |
| **Interactive reads** (search, filters, polling, infinite scroll) | TanStack Query `useQuery` against FastAPI. |
| **Mutations** (create/update/delete anything) | TanStack Query `useMutation` against FastAPI. |

**Why:** Server Actions are RPC over Next's internal protocol — not a JSON API. A mobile app, partner school, or external integration can't call them. Every feature's logic lives in **one place** (FastAPI services), reachable by every client.

**Existing Server Actions are being removed phase by phase** as each domain is ported to FastAPI in Phase 2. Don't add new ones. If you find yourself reaching for `"use server"`, you almost certainly want a FastAPI route + a TanStack Query hook instead.

### 9. Legacy: `ActionResult<T>` (transitional — for remaining Server Actions only)

Every server action returns `Promise<ActionResult<T>>` from [`src/lib/action-result.ts`](../src/lib/action-result.ts):

```ts
export type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };
```

The generic intersects data fields directly into the success branch, so callers destructure inline (matches existing patterns like `if (result.success) router.push(result.redirect)`).

```ts
import type { ActionResult } from "@/lib/action-result";

// No data on success
export async function deactivateUserAction(uid: string): Promise<ActionResult> {
  // …
  return { success: true };
}

// With data on success
export async function createStudentAction(input): Promise<ActionResult<{ id: string }>> {
  // …
  return { success: true, id: created.id };
}

// Multiple fields
Promise<ActionResult<{ sessionId: string; redirect: string }>>
```

**Don't throw from a public server action** — catch internally and return the failure shape. Throwing crashes the route and falls through to the closest `error.tsx` boundary. That's correct for *unexpected* errors (programming bugs, DB down) but wrong for *expected* business errors like "not found" or "not allowed". For those, return `{ success: false, error }` so the UI can render an inline toast.

```ts
// ✅
export async function approveLessonPlanAction(id: string): Promise<ActionResult> {
  try {
    const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, id) });
    if (!plan) return { success: false, error: "Lesson plan not found." };
    if (plan.status !== "submitted") {
      return { success: false, error: "Plan must be submitted to approve." };
    }
    await applyReview(id, /* … */);
    return { success: true };
  } catch (err) {
    console.error("[approveLessonPlan]", err);
    return { success: false, error: "Unexpected error. Please try again." };
  }
}
```

Internal helpers (private functions inside actions/, services if/when extracted) can throw freely — they're internal. Public exported actions are the boundary that catches and returns.

### 10. Audit-log sensitive mutations

Any admin action that overrides defaults, deactivates a person, changes a role, or modifies financial / academic records writes an `audit_log` row. Use the helper in [src/lib/audit-log.ts](../src/lib/audit-log.ts).

Already wired for: `SCORE_OVERRIDE`, `STUDENT_EDIT`, `ROLE_CHANGE`, `PROMOTION_APPROVED`, settings updates.

### 11. Never log auth tokens or session cookies

`console.log(idToken)`, `console.log(sessionCookies)`, etc. captures sensitive credentials. Railway / Sentry / any future error tracking will store them indefinitely.

If you must debug auth, log the *decoded* `uid` or `email`, never the token.

### 12. Use `revalidatePath` after mutations

When a server action mutates data that's shown elsewhere, call `revalidatePath("/affected/route")` before returning. Otherwise users see stale data until next navigation.

---

## UI

### 13. Server Components by default

Add `"use client"` only when you need interactivity, browser APIs, or hooks. Pushing more work to the server keeps bundles small and loading fast.

### 14. Loading + error boundaries on data-fetching routes

For any route that fetches DB data in its Server Component, add a sibling `loading.tsx` (skeleton) and `error.tsx` (graceful retry). The 4 role-dashboard routes already have `loading.tsx` as templates.

```
src/app/(dashboard)/admin/students/
├── page.tsx
├── loading.tsx       ← required
└── error.tsx         ← required when the page does any DB read
```

### 15. Memoize high-render-count components

Components that render 50+ rows (attendance sheets, score grids, audit log tables, students list) should:
- Wrap row components in `React.memo`
- Use `useCallback` for handlers passed as props
- Use `useMemo` for computed lists

For most components — skip this. It's noise without measurable benefit at low render counts.

### 16. shadcn primitives only, no raw HTML form elements

All inputs, buttons, selects, dialogs, etc. use `@/components/ui/*`. Add missing ones with `npx shadcn@latest add <name> -y`. The exception is `<input>` inside the wrapper — see the existing `<Input>` component that uses native `<input>` after the `@base-ui/react` `Field.Control` mount-loop bug.

### 17. Mobile-responsive defaults

Page-header rows: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`. Wide tables: `overflow-x-auto`. Report cards: `overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0` for side-scroll on phones with print-safe layout.

---

## File structure

### 18. Feature-based modules

All domain code lives in `src/features/<name>/`. Each feature contains:

```
src/features/<name>/
├── components/       # UI components for this feature
├── actions/          # Server Actions (mutations)
├── queries/          # Server-side query functions
├── lib/              # Pure helpers (computeGrade, audience resolution, etc.)
└── types.ts          # TS types for this feature
```

Don't dump feature-specific components into `src/components/`. That folder is for truly shared primitives (buttons, dialogs).

### 19. Co-locate tests with what they test

**Web (Vitest + Playwright)** — top-level `apps/web/tests/`:
- `tests/{unit,integration}/<feature>.test.ts` — Vitest, mocks `@/lib/supabase/server` via `tests/setup.ts`.
- `tests/e2e/specs/<NN-name>.spec.ts` — Playwright, against `.env.e2e`'s local Supabase + seeded users.

**API (pytest)** — feature-local:
- Unit + router tests live **inside the feature**: `apps/api/app/features/<domain>/tests/test_service.py`, `test_router.py`, with a feature-scoped `conftest.py`.
- Cross-feature integration tests + E2E live in a top-level `apps/api/tests/integration/` (and `tests/e2e/`).
- Pytest finds both via `pyproject.toml` → `[tool.pytest.ini_options] testpaths = ["app", "tests"]`.

The feature-local pattern enforces self-containment — porting, deleting, or extracting a domain moves *one folder*. Cross-feature flows ("lesson plan submission triggers a notification to the unit head") are the only thing that belongs in the top-level `tests/`; everything else is suspect there.

New features ship with tests for the service layer (pure logic) and the router (HTTP contract). The service-layer test mocks the repository; the router test uses FastAPI's `TestClient` against an in-memory session.

---

## FastAPI conventions

### 20. Pydantic schemas — one file per domain, `Create` / `Update` / `Read` naming

All request and response bodies are typed Pydantic models in `apps/api/app/features/<domain>/schema.py`. Never accept or return raw `dict`s from routes (with the narrow exceptions called out below).

**Naming follows the SQLModel / Tiangolo convention** — same naming family as our TS `CreateStudentInput` / `UpdateStudentInput`:

```python
class StudentBase(BaseModel):
    """Fields shared by inbound and outbound shapes."""
    first_name: str
    last_name: str
    dob: date
    gender: Gender

class StudentCreate(StudentBase):
    """Inbound on POST /students."""
    class_id: str

class StudentUpdate(BaseModel):
    """Inbound on PATCH /students/{id} — all fields optional, doesn't inherit Base."""
    first_name: str | None = None
    last_name: str | None = None

class StudentRead(StudentBase):
    """Outbound on every response that returns a student."""
    id: str
    school_id: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)  # accepts ORM rows
```

Rules:
- **One file per domain**: `schema.py` next to `model.py`, `service.py`, `router.py`.
- **`Base` for shared fields**, `Create` inherits, `Update` does NOT inherit (all-optional shape doesn't compose with required fields).
- **`Read` carries the response shape** — including server-set fields (`id`, `created_at`, joined display names). `from_attributes=True` so it accepts SQLAlchemy rows directly via `StudentRead.model_validate(row)`.
- **Variants when needed**: `StudentEnrollmentRead`, `StudentReportCardRead`. Never `StudentReadV2` or `StudentReadAdmin` — branch on intent, not version or audience.
- **List wrappers** for paged collections: `class StudentList(BaseModel): items: list[StudentRead]; total: int`. Never tuples / dicts / bare lists with side-data.

### 21. Routes declare `response_model=` — always

Every router decorator sets `response_model`. The Python return type alone isn't enough — `response_model` does two things the annotation doesn't:

1. **Strips fields not in the schema** — defense-in-depth against accidentally leaking a SQLAlchemy lazy-loaded relationship or a sensitive column.
2. **Forms the OpenAPI contract** that drives `apps/web/src/types/api.d.ts` typegen. Skip it and the frontend types drift.

```python
@router.get("/students", response_model=list[StudentRead])
async def list_students(...) -> list[StudentRead]:
    ...

@router.post(
    "/students",
    response_model=StudentRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_student(...) -> StudentRead:
    ...

@router.patch("/students/{id}", response_model=StudentRead)
async def update_student(...) -> StudentRead:
    ...
```

Exceptions where a raw type is OK (rare):
- `/health` → `dict[str, str]` — no domain meaning.
- 204 No Content → `Response(status_code=204)`, no schema.
- Streaming responses → `StreamingResponse`.

Everything else: a schema.

### 22. Error shape is the `AppError` envelope

Domain errors raise an `AppError` subclass from `app/core/errors.py` (`NotFoundError`, `ConflictError`, `ForbiddenError`, etc.). The global handler in `app/main.py` converts these into `{"error": {"code": "...", "message": "..."}}` with the right status code. Don't `raise HTTPException` from feature code — use the typed error subclasses so the response shape stays uniform across the API.

---

## Dates and times

### 20. Centralize date handling via `src/lib/dates.ts`

Use the helpers in [`src/lib/dates.ts`](../src/lib/dates.ts), never raw `new Date(...)` for display. The helpers wrap `date-fns` and enforce consistent formatting.

```ts
import { formatDate, formatDateLong, formatDateWithWeekday, todayISO } from "@/lib/dates";

formatDate("2026-05-15")                  // "15 May 2026"
formatDateLong("2026-05-15")              // "Friday, 15 May 2026"
formatDateWithWeekday("2026-05-15")       // "Fri, 15 May 2026"
formatDate("2026-05-15", "EEEE, d MMM")   // custom format via date-fns tokens
todayISO()                                // "2026-05-22" — for date input defaults
```

Storage conventions:
- **Date-only values** (DoB, exam date, term start/end, attendance date): store as `YYYY-MM-DD` strings. The helpers parse those correctly as local-date (no timezone shift).
- **Timestamps** (createdAt, reviewedAt): store as `Date` / `timestamp` columns. The helpers accept either Date or ISO-string.

**Never write** `new Date(\`${date}T00:00:00\`).toLocaleDateString(...)` — string concat to local-midnight is timezone-fragile (in dev's TZ, a school in Accra would render midnight Accra; on a Railway pod in a different region, the date drifts). The helpers parse with `parseISO`, which is consistent regardless of server TZ.

If you need a custom format, pass a date-fns token string to `formatDate(value, fmt)`. Don't recreate the parsing.

---

## CI / Quality

### 21. Don't merge a PR with red CI

Lint, tsc, Vitest, and (for `main` pushes) Playwright E2E must all be green. The Railway deploy is gated by CI passing.

If a test fails for unrelated reasons, fix it in the PR — don't skip / mark `.skip` and "deal with it later".

### 22. Don't commit secrets

`.env.local` is gitignored. Service-account JSONs, Firebase keys, Neon connection strings, Gmail App Passwords — all go in `.env.local` (dev), the Railway env (prod), or `.env.seed` (one-off seeding scripts). Never in tracked files.

Quick check before commit: `git check-ignore .env.local` should print the filename.

### 23. Direct commits to main only for emergency fixes

Doc-only changes and emergency rollbacks/CI-fixes can land on `main` directly. Everything else goes through a PR with at least the user's review (or AI's structured walk-through). CI is the safety net, but PRs are the design review.

---

## When in doubt

1. Look at how the most recent feature in the codebase did it (PR history is reverse-chronological in `git log`).
2. Check the relevant audit doc — [CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) for technical debt, [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) for depth questions, [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) for "should this exist at all".
3. Don't reinvent. There's almost always a precedent.

---

## How this doc gets updated

When you fix something from the [Codebase Audit](CODEBASE-AUDIT.md) that establishes a new convention (e.g. we add `src/lib/dates.ts` → this doc gains a rule about using it), update both:
- This file (the rule)
- CODEBASE-AUDIT.md (mark the item ✅ Done)

Don't let conventions drift from reality.
