# Engineering Conventions

Working principles for the UHAS SMS codebase. These crystallize lessons from the [Codebase Audit](CODEBASE-AUDIT.md) — what we've fixed should not regress.

Treat this doc as load-bearing: PR reviews can cite it, AI assistants reading the repo will follow it. The hard rules are in [CLAUDE.md](../CLAUDE.md) at the project root.

Last reviewed: 2026-07-16 — updated for the post-Strategy-A stack (FastAPI + SQLAlchemy/Alembic + Supabase). The Drizzle/Server-Action-era rules this doc used to carry are gone; see `git log` on this file if you need the old versions for historical PRs.

---

## Database (`apps/api/` only — see [CLAUDE.md](../CLAUDE.md#database))

Next.js has zero direct database access. Everything below lives in `apps/api/app/features/<domain>/model.py` / `repository.py`.

### 1. Index FK columns and filter-heavy columns

Every new column that participates in a `WHERE` filter, `ORDER BY`, or foreign-key join needs an index — Postgres does not auto-index foreign keys. Add the index in the same migration that adds the column.

```python
# apps/api/alembic/versions/<rev>_add_my_things.py
op.create_table(
    "my_things",
    sa.Column("id", sa.Uuid, primary_key=True, server_default=sa.text("gen_random_uuid()")),
    sa.Column("school_id", sa.Uuid, sa.ForeignKey("schools.id"), nullable=False),
    sa.Column("owner_id", sa.Uuid, sa.ForeignKey("staff.id"), nullable=False),
    sa.Column("status", sa.String(20), nullable=False),
    sa.Column("created_at", sa.DateTime, server_default=sa.text("now()")),
)
op.create_index("my_things_school_status_idx", "my_things", ["school_id", "status"])
op.create_index("my_things_owner_idx", "my_things", ["owner_id"])
```

For composite indexes, order columns by selectivity — most-selective first. The current pattern across the repo is `(school_id, ...)` because most queries scope by school.

### 2. No ORM `relationship()` anywhere — explicit queries in the repository

This codebase has **zero** SQLAlchemy `relationship()`/`backref` declarations (verified: `grep -rn "relationship(" app/features` returns nothing). Every FK is a plain `mapped_column(Uuid, ForeignKey(...))`. When a repository needs joined data, it writes an explicit `select()` (with `.join()` or a follow-up query), not an ORM-graph traversal.

```python
# repository.py
async def get_with_class_and_subject(session: AsyncSession, plan_id: UUID) -> LessonPlan | None:
    result = await session.execute(
        select(LessonPlan).where(LessonPlan.id == plan_id)
    )
    return result.scalar_one_or_none()
    # Caller fetches Class/Subject/Staff separately by their FK id if needed —
    # there's no `.class_`/`.subject` attribute to load eagerly, because no
    # relationship() exists to load.
```

This has a real, sharp edge: bulk-insert scripts (seed data, fixtures) must **flush explicitly between dependency layers** — SQLAlchemy won't reorder INSERTs across unrelated mapped classes to satisfy FK constraints for you the way it would if relationships existed. See `apps/api/app/scripts/seed/identity.py` for the pattern (flush after parents, before children).

### 3. Migrations only, hand-written, no autogenerate

Schema changes go through `uv run alembic revision -m "…"` (creates an empty migration file) then **hand-write** the `op.*` calls — `--autogenerate` is never used. The SQL must be reviewable in the PR and applied identically across dev/test/prod via `uv run alembic upgrade head`.

### 3a. Primary keys are uuid; slug as secondary on entity tables

Every primary key is `Uuid PRIMARY KEY, server_default=gen_random_uuid()`. **Never** declare a string PK on a new table. Feature code does not construct ids via string interpolation.

Where the entity benefits from a human-readable identifier (URLs, audit logs, dropdowns), add a separate `slug` column:

```python
class Staff(Base):
    __tablename__ = "staff"
    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, server_default=func.gen_random_uuid())
    slug: Mapped[str] = mapped_column(String(50), nullable=False)   # "STAFF-042"
    school_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("schools.id"), nullable=False)
    # ...

    __table_args__ = (UniqueConstraint("school_id", "slug", name="staff_school_slug_unique"),)
```

Tables that get a slug today: **schools, staff, students, guardians, classes, subjects**. Everything else (audit_log, notifications, enrollments, scores, exams, lesson_plans, schemes, assignments, attendance, promotions, etc.) uses the UUID alone.

`schools.slug` is globally unique; every other slug is unique-per-school.

**Slug generation** lives in the service layer — `app/core/slug.py`'s `insert_with_sequential_slug` handles the retry-on-collision pattern for sequential schemes like `STAFF-042` (query the highest existing slug for the prefix + increment). For human-set slugs (school slug `"uhas-basic"`), accept from the admin form.

**Slug is for display, never for lookups or authorization.** `staff.id`/`guardians.id` (the real UUID) is what JWT `linked_id` claims resolve against and what every FK points to — `slug` never appears in a `WHERE` clause outside of uniqueness checks. A recurring frontend bug this session: rendering `user.linkedId` (the UUID) where `user.slug` (the human-readable id) was intended — check both exist and are used for the right purpose before shipping a new "show the user's id" UI.

**Seed fixtures** use `det(key)` — a deterministic sha256-derived UUID, kept identical on both sides: `apps/web/src/lib/uuid.ts` (TypeScript, used by `apps/web/scripts/seed-supabase-users.ts` for the Supabase Auth accounts) and `apps/api/app/scripts/seed/det.py` (Python port, used for the matching `staff`/`guardians`/`schools` rows those accounts link to). Same input → same UUID on both sides — that's what makes a JWT's `app_metadata.linked_id` resolve to a real row. Only rows an external claim points at need a deterministic id; everything else in a seed script gets a random `uuid4()`.

### 4. Always filter by `school_id`, resolved from the JWT

Every query scopes by `school_id` via `CurrentSchoolIdDep` (`app/core/deps.py`'s `get_current_school_id`, which reads the JWT's `app_metadata.school_id` claim per-request). There is no hardcoded school constant anywhere in the backend — multi-tenancy at the data-access layer is already real, even though there's no UI yet to onboard a second school.

```python
# ✅
@router.get("", response_model=StudentsListResponse)
async def list_students(school_id: CurrentSchoolIdDep, session: SessionDep) -> StudentsListResponse:
    rows, total = await StudentsService.list_for_school(session, school_id)
    ...

# ❌ — never resolve school_id any other way (path param, hardcoded constant, etc.)
```

### 5. Soft delete high-risk tables

For tables where users can delete via the UI (lesson plans, scores, assignments, schemes), add a `deleted_at` timestamp column instead of a hard `DELETE`. Filter it out in queries.

Tables that only have an `is_active` boolean (staff, students, schools) don't need this — deactivation is already non-destructive.

---

## TypeScript

### 6. No `any`, no `ts-ignore`, no `ts-expect-error`

When the compiler complains, the answer is to fix the types, not silence them. If a third-party library has weak types, write a typed wrapper in a `*.types.ts` file rather than `as any` at every call site.

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

Same for `Division` (`KG | Lower Primary | Upper Primary | JHS`), `LessonPlanStatus`, etc. Every closed union has exactly one source-of-truth module per side — see [CLAUDE.md](../CLAUDE.md)'s "Centralise enums and constants" convention.

### 8. Validate all form input with Zod

Every form goes through `react-hook-form` + `zodResolver(schema)`. Zod schemas live next to the form component or in `types.ts`. Errors as objects `{ message: "..." }`, never bare strings.

```ts
const schema = z.object({
  email: z.email({ message: "Enter a valid email" }),
  age: z.number().int().min(3, { message: "Must be at least 3" }),
});
```

---

## Mutations & Data Fetching

### 9. All domain data access — reads and mutations — goes through FastAPI

Drizzle and Next.js Server Action mutations are **fully decommissioned** as of Phase 2 (see [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md)). Every domain-data operation is one of these:

| Operation | Mechanism |
|---|---|
| **Auth** (sign in/out, refresh, OTP verify) | Supabase client SDK directly — `supabase.auth.signInWithPassword()`, `signOut()`, `verifyOtp()`. No Server Action, no FastAPI hop. |
| **Server Component reads** | `getApi()` (`lib/api/server.ts`) called directly in the page, or via a `features/<name>/queries/` helper. |
| **Client-side reads/mutations** (search, filters, forms) | TanStack Query `useQuery`/`useMutation` in `features/<name>/hooks/`, calling `api.<domain>.<method>()` from `lib/api/browser.ts`. |

**Why:** a JSON API over HTTP is reachable from a mobile app, a partner-school integration, or any future client — Server Actions (RPC over Next's internal protocol) are not. Every feature's business logic lives in **one place** (FastAPI services).

**`"use server"` is not banned outright** — it's reserved for the narrow set of things that genuinely aren't domain-data mutations: setting a cookie (the academic-year switcher), minting a Supabase Storage signed URL for a download click. If you're reaching for `"use server"` to create/update/delete a domain record, you want a FastAPI route + a TanStack Query hook instead.

### 10. Atomic multi-step mutations — one backend transaction, not a client-orchestrated sequence

If a single user action requires more than one write (withdraw an old enrollment + create a new one; remove the old class teacher + assign the new one), that's **one new FastAPI service method** doing both inside the same DB session, not two sequential `useMutation` calls from the frontend. A client-orchestrated sequence can fail between the two calls and leave the record in a broken half-state (a student with no active enrollment anywhere; a class with no teacher) — and the frontend has no good way to roll back the first call once the second has failed.

```python
# ✅ one transaction — a failure after the withdraw rolls back the whole thing
async def transfer_student(session, school_id, student_id, new_class_id, *, actor_user_id):
    current = await EnrollmentsRepository.get_active_for_student(session, school_id, student_id, year)
    if current is not None:
        current.status = WITHDRAWN
    session.add(Enrollment(student_id=student_id, class_id=new_class_id, status=ACTIVE, ...))
    await session.flush()
    ...
```

```ts
// ❌ two independent calls — a failure between them leaves no active enrollment
await api.enrollments.changeStatus(oldEnrollmentId, { status: "Withdrawn" });
await api.enrollments.create({ studentId, classId: newClassId }); // if this 500s, student has nothing
```

This was found repeatedly during a correctness audit (student class transfer, class-teacher reassignment) — when reviewing a flow with 2+ related API calls fired back-to-back from one button click, ask whether a backend transaction should own the whole sequence instead.

### 11. `ActionResult<T>` — only for the true Server Actions above

The handful of remaining Server Actions (cookies, signed URLs) return `Promise<ActionResult<T>>` from [`apps/web/src/lib/action-result.ts`](../apps/web/src/lib/action-result.ts):

```ts
export type ActionResult<T = void> =
  | (T extends void ? { success: true } : { success: true } & T)
  | { success: false; error: string };
```

**Don't throw from one** — catch internally and return the failure shape. Throwing crashes the route and falls through to the closest `error.tsx` boundary, which is correct for *unexpected* errors but wrong for *expected* ones ("not found", "not allowed").

Client-side mutations against FastAPI (the dominant pattern — TanStack `useMutation`) don't use `ActionResult` at all: catch `ApiError` (from `@/lib/api/client`) and `toast.error(err instanceof ApiError ? err.message : "…")` on error; `queryClient.invalidateQueries(...)` on success. **The fallback string must name the specific action** ("Failed to update class.", "Failed to waive fee.") — never a bare `"Something went wrong."` The `ApiError` branch already carries a specific server-side message; the fallback only fires for network failures or unexpected exceptions, where the user still deserves to know *what* didn't work, not just that something didn't. When one `onError` handler is shared across several mutations in the same hook file (a `useMutation` per CRUD verb, one shared error callback), give each mutation its own handler with its own message instead — a shared generic handler is how this drifts in the first place.

### 12. Audit-log sensitive mutations — on the FastAPI side

Any action that overrides defaults, deactivates/reactivates a person, changes a role or standing (Unit Head, active status), modifies academic records, or touches money writes an `audit_log` row via `apps/api/app/features/audit/service.py`'s `write_audit_log`, inside the same transaction as the mutation. See `app/features/audit/actions.py` for the current closed set of action constants — `write_audit_log`'s `action` param requires one of them, not a bare string. New actions get added to **both** `actions.py` and `apps/web/src/features/audit-log/types.ts` (label + filter-pill colour) in the same PR.

**When adding a new mutation to an existing domain, check its siblings.** A correctness audit found this gap repeatedly: one method in a service file writes an audit row and the sibling right next to it — same authority level, same kind of decision — doesn't (`approve()` logged, `send_back()` didn't; `add_guardian()`/`remove_guardian()` logged, `update_guardian_link()` in between didn't). It's an easy miss because the audited sibling reads as "this is what audit logging for this domain looks like" and the unaudited one just never got the same treatment. Before shipping a new mutation, ask: does the analogous action elsewhere in this file get audited? If yes and this doesn't, that's a bug, not a stylistic choice. Also check whether a mutation only gets audited *indirectly* through a linked record (e.g. deactivating a Staff row only logged when it cascaded to a linked login) — the direct mutation on the primary row needs its own audit entry regardless of whether a cascade happens.

### 13. Never log auth tokens or session cookies

`console.log(idToken)`, `console.log(sessionCookies)`, etc. captures sensitive credentials. Railway / Sentry / any future error tracking will store them indefinitely.

If you must debug auth, log the *decoded* `uid` or `email`, never the token.

### 14. `revalidatePath` is now the rare exception, not the default

Most mutations are client-side TanStack `useMutation` calls, which handle freshness via `queryClient.invalidateQueries(...)` — no `revalidatePath` involved. Call `revalidatePath("/affected/route")` only from one of the few remaining true Server Actions (§10), when it mutates data a Server Component route reads.

---

## UI

### 15. Server Components by default

Add `"use client"` only when you need interactivity, browser APIs, or hooks. Pushing more work to the server keeps bundles small and loading fast.

### 16. Loading + error + not-found boundaries on data-fetching routes

For any route that fetches data in its Server Component, add sibling `loading.tsx` (skeleton) and `error.tsx` (graceful retry) files. The 4 role-dashboard routes are templates. Root-level `not-found.tsx` and `(dashboard)/not-found.tsx` handle unmatched routes — the dashboard variant preserves the sidebar/header shell, matching how `(dashboard)/error.tsx` handles thrown errors.

```
src/app/(dashboard)/admin/students/
├── page.tsx
├── loading.tsx       ← required
└── error.tsx         ← required when the page does any data read
```

**When the same feature is shared across roles (e.g. a students list rendered at `/admin/students`, `/deputy-head/students`, `/teacher/students`), every role's route needs its own `loading.tsx`.** These are separate directories in the App Router, so adding the skeleton for Admin doesn't do anything for the other two — a real gap found this way left Deputy Head and Teacher with an unstyled blank flash where every other role showed the shared `PageSkeleton`. When you add a loading/error boundary to one role's copy of a shared page, grep for the other roles' equivalent routes in the same PR and check they have one too.

### 17. Memoize high-render-count components

Components that render 50+ rows (attendance sheets, score grids, audit log tables, students list) should:
- Wrap row components in `React.memo`
- Use `useCallback` for handlers passed as props
- Use `useMemo` for computed lists (and for a `ColumnDef[]` array passed to `DataTable` — otherwise every parent re-render defeats TanStack's row memoization)

For most components — skip this. It's noise without measurable benefit at low render counts.

### 18. shadcn primitives only, no raw HTML form elements

All inputs, buttons, selects, dialogs, etc. use `@/components/ui/*`. Add missing ones with `pnpm dlx shadcn@latest add <name> -y`.

### 19. Mobile-responsive defaults

Page-header rows: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`. Report cards: `overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0` for side-scroll on phones with print-safe layout.

**Wide tables: `overflow-x-auto` on the wrapping element — but this only happens automatically if you're using the shared `@/components/ui/table` primitive**, whose root wrapper already bakes in `overflow-x-auto`. A raw `<table>` element (used for a few lightweight card-style tables that predate `DataTable` adoption) gets none of that for free — it needs an explicit `overflow-x-auto` div, and clips silently on a phone without one. When you reach for a raw `<table>` instead of the shared component (acceptable for a small, non-sortable, non-paginated table), wrap it yourself: `<div className="overflow-x-auto"><table className="min-w-[...]">`.

### 20. Confirmation-dialog copy: name the target in the title, be consistent about reversibility

Every destructive/state-changing confirmation (`AlertDialog`) across the app should read as one voice, not one dialect per feature:
- **Title names the specific target**: `"Deactivate {firstName} {lastName}?"`, not a generic `"Deactivate user?"` — the generic form makes a user re-check which row they clicked.
- **Description states what happens and whether it's reversible**, in that order: `"They will be marked inactive. You can reactivate at any time."` for a reversible toggle; `"...This can't be undone."` for something genuinely permanent (a waived fee, an excluded record).
- Don't invent a new verb/structure per domain for the same underlying action shape — a Deactivate dialog on Staff and a Deactivate dialog on Students should differ only in the entity-specific noun, not in title phrasing or paragraph structure. If you're adding a new destructive action, check how the closest existing one (usually Staff's) phrases it before writing new copy.

---

## File structure

### 21. Feature-based modules

All domain code lives in `apps/web/src/features/<name>/`. Most features contain:

```
apps/web/src/features/<name>/
├── components/       # UI components for this feature
├── hooks/            # TanStack Query hooks (useQuery/useMutation) calling lib/api/browser.ts
├── queries/          # Async functions calling lib/api/server.ts, for Server Component reads
└── types.ts          # TS types for this feature
```

A handful of features with cookie-only or non-domain concerns (`shell`, `uploads`) additionally keep a thin `actions/` — see rule §9. Don't add `actions/` to a feature just to hold a domain mutation; that belongs in `hooks/` calling FastAPI.

Don't dump feature-specific components into `apps/web/src/components/`. That folder is for truly shared primitives (buttons, dialogs, the `DataTable`).

### 22. Co-locate tests with what they test

**Web (Vitest + Playwright):**
- **Unit tests live next to the source**: `src/features/<domain>/utils.test.ts`, `src/features/<domain>/lib/*.test.ts` — pure-logic tests, no DB, no mocked network. `vitest.config.ts`'s `include` picks up `src/**/*.test.ts` directly; there's no separate top-level `tests/unit/` folder.
- `tests/integration/*.test.ts` — the few cross-cutting integration-style tests that don't belong to one feature.
- `tests/e2e/specs/<NN-name>.spec.ts` — Playwright. **Currently disabled in CI** (`if: false` in `.github/workflows/ci.yml`) — it still targets the pre-migration Firebase/Server-Action surface and hasn't been re-ported to Supabase Auth + the FastAPI client.

**API (pytest)** — feature-local:
- Unit + router tests live **inside the feature**: `apps/api/app/features/<domain>/tests/test_service.py`, `test_router.py`, with a feature-scoped `conftest.py`. Each feature's `conftest.py` claims its own hex-prefix UUID range to avoid collisions when the full suite runs in one shared transaction-per-test database.
- Cross-cutting code (e.g. `app/integrations/*`) gets its own `tests/` alongside it. There's no top-level `apps/api/tests/` — nothing needs one yet.

The feature-local pattern enforces self-containment — porting, deleting, or extracting a domain moves *one folder*.

**A sharp edge specific to this repo:** `apps/api`'s tests run against the *same* local Postgres your dev server and seed script use (there's no separate `.env.test`) — isolation comes from each test's transaction being rolled back at teardown, not from a genuinely empty database. Any query that isn't scoped to a pinned test UUID (`SCHOOL_UUID`, a fixture's own `det()`-free random id, etc.) can see real committed data from manual testing or the demo seed script and produce flaky, environment-dependent failures. If a test needs "the only X in the table," explicitly neutralize ambient rows inside its own transaction first (e.g. `UPDATE schools SET is_active = false WHERE id != :pinned_id`) rather than assuming the table starts empty — see `apps/api/app/features/schools/tests/test_router.py`'s `/school/public` tests for the pattern.

---

## FastAPI conventions

### 23. Pydantic schemas — one file per domain, `Create` / `Update` / `Read` naming

All request and response bodies are typed Pydantic models in `apps/api/app/features/<domain>/schema.py`. Never accept or return raw `dict`s from routes (with the narrow exceptions called out below).

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
    id: UUID
    school_id: UUID
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, alias_generator=to_camel, populate_by_name=True)
```

Rules:
- **One file per domain**: `schema.py` next to `model.py`, `service.py`, `router.py`.
- **`Base` for shared fields**, `Create` inherits, `Update` does NOT inherit (all-optional shape doesn't compose with required fields).
- **`Read` carries the response shape** — including server-set fields (`id`, `created_at`, joined display names). `from_attributes=True` so it accepts SQLAlchemy rows directly via `StudentRead.model_validate(row)`.
- **Wire format is camelCase** (`alias_generator=to_camel`, `populate_by_name=True`) so the OpenAPI-generated TS types match the existing camelCase domain types in `apps/web`.
- **Variants when needed**: `StudentEnrollmentRead`, a narrow `SchoolPublicRead` for the one unauthenticated endpoint. Never `StudentReadV2` or `StudentReadAdmin` — branch on intent, not version or audience.
- **List wrappers** for paged collections: `class StudentsListResponse(BaseModel): items: list[StudentRead]; total: int`. Never tuples / dicts / bare lists with side-data.

### 24. Routes declare `response_model=` — always

Every router decorator sets `response_model`. The Python return type alone isn't enough — `response_model` does two things the annotation doesn't:

1. **Strips fields not in the schema** — defense-in-depth against accidentally leaking a column that shouldn't be public.
2. **Forms the OpenAPI contract** that drives `apps/web/src/types/api.d.ts` typegen (`pnpm generate:api-types`, checked in CI via `scripts/check-api-types-drift.sh`). Skip it and the frontend types drift.

```python
@router.get("/students", response_model=StudentsListResponse, response_model_by_alias=True)
async def list_students(...) -> StudentsListResponse:
    ...
```

Exceptions where a raw type is OK (rare): `/health` → `dict[str, str]`, no domain meaning; 204 No Content responses; streaming responses.

### 25. Pagination — `size` caps scale to the domain, not a fixed default

Every list endpoint takes `page: int = 1` and `size: int` with an explicit `le=` upper bound. Most domains cap at 100 — but a handful of small-cardinality "lookup" resources (`classes`, `staff`, `calendar`) cap higher (500), because several frontend pages fetch "everything" for a dropdown in one page rather than implementing real pagination for a list that's bounded by school size, not by row-count risk. `audit`/`sms_log` cap at 200 for the same "genuinely higher volume" reason. When you add a new `size` param, check what the frontend caller actually needs before defaulting to 100 — a mismatch here 422s silently and was the cause of a real production-shaped bug this session (`/classes?size=200` against a `le=100` cap).

### 26. Error shape is the `AppError` envelope

Domain errors raise an `AppError` subclass from `app/core/errors.py` (`NotFoundError`, `ConflictError`, `ForbiddenError`, etc.). The global handler in `app/main.py` converts these into `{"error": {"code": "...", "message": "..."}}` with the right status code. Don't raise a bare `HTTPException` from feature code — use the typed error subclasses so the response shape stays uniform across the API. (FastAPI's own built-in validation errors — e.g. a query param outside its `le=` bound — still come back as `{"detail": [...]}`, a different shape; `apps/web/src/lib/api/client.ts`'s `apiFetch` only surfaces the `AppError` shape's message today, so a raw validation 422 currently shows a generic "HTTP 422" client-side rather than the real reason — worth keeping in mind when debugging a 422 that doesn't show a useful toast.)

---

## Dates and times

### 27. Centralize date handling via `lib/dates.ts`

Use the helpers in [`apps/web/src/lib/dates.ts`](../apps/web/src/lib/dates.ts), never raw `new Date(...)` for display. The helpers wrap `date-fns` and enforce consistent formatting.

```ts
import { formatDate, formatDateLong, formatDateWithWeekday, todayISO } from "@/lib/dates";

formatDate("2026-05-15")                  // "15 May 2026"
formatDateLong("2026-05-15")              // "Friday, 15 May 2026"
formatDateWithWeekday("2026-05-15")       // "Fri, 15 May 2026"
formatDate("2026-05-15", "EEEE, d MMM")   // custom format via date-fns tokens
todayISO()                                // "2026-05-22" — for date input defaults
```

Storage conventions:
- **Date-only values** (DoB, exam date, term start/end, attendance date): FastAPI stores/returns `date` (ISO `YYYY-MM-DD` strings over the wire). The helpers parse those correctly as local-date (no timezone shift).
- **Timestamps** (created_at, reviewed_at): FastAPI stores/returns `datetime` (ISO 8601 strings over the wire). The helpers accept either a `Date` or an ISO string.

**Never write** `new Date(\`${date}T00:00:00\`).toLocaleDateString(...)` — string concat to local-midnight is timezone-fragile (in dev's TZ, a school in Accra would render midnight Accra; on a Railway pod in a different region, the date drifts). The helpers parse with `parseISO`, which is consistent regardless of server TZ.

**Also avoid ad-hoc `.toLocaleDateString()` / `.toLocaleString()` without an explicit locale** even when the timezone issue doesn't apply — the rendered format (`MM/DD/YYYY` vs `DD/MM/YYYY` vs spelled-out month) depends on the *visiting browser's* locale setting, not the school's, so the same timestamp can render differently for two admins sitting in the same room. If a genuinely new format is needed that none of the named helpers cover, call `formatDate(value, "<date-fns tokens>")` with a custom token string rather than reaching for `toLocaleDateString` — that keeps parsing centralized even when the display format is one-off.

---

## CI / Quality

### 28. Don't merge a PR with red CI

Two required jobs in `.github/workflows/ci.yml`: `web` (lint + tsc + Vitest + build) and `api` (ruff + mypy + pytest + Alembic-upgrade-from-scratch + OpenAPI/TS drift check). Both must be green. The Playwright E2E job exists but is currently disabled (`if: false`) — not a merge gate until it's re-ported to the current auth/API stack. The Railway deploy is gated on the two enabled jobs.

If a test fails for unrelated reasons, fix it in the PR — don't skip / mark `.skip` and "deal with it later".

### 29. Don't commit secrets

`.env.local` (web) and `.env` (api) are gitignored. Supabase service-role keys, SMTP passwords, Inngest signing keys, Sentry/Logfire tokens — all go in `.env.local`/`.env` (dev) or the Railway env (prod). Never in tracked files.

Quick check before commit: `git check-ignore apps/web/.env.local apps/api/.env` should print both filenames.

### 30. Direct commits to main only for emergency fixes

Doc-only changes and emergency rollbacks/CI-fixes can land on `main` directly. Everything else goes through a PR with at least the user's review (or AI's structured walk-through). CI is the safety net, but PRs are the design review.

---

## When in doubt

1. Look at how the most recent feature in the codebase did it (PR history is reverse-chronological in `git log`).
2. Check the relevant audit doc — [CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) for technical debt, [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) for depth questions, [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) for "should this exist at all".
3. Don't reinvent. There's almost always a precedent.

---

## How this doc gets updated

When you fix something from the [Codebase Audit](CODEBASE-AUDIT.md) that establishes a new convention, or discover a real bug during unrelated work that reveals a gap in an existing rule, update both:
- This file (the rule)
- CODEBASE-AUDIT.md (mark the item ✅ Done), if applicable

Don't let conventions drift from reality — several of the rules above exist specifically because a mismatch between this doc and the real codebase caused a real bug this session (the `size` pagination cap, the `linkedId`/`slug` display confusion, the shared-dev-DB test-isolation gotcha).
