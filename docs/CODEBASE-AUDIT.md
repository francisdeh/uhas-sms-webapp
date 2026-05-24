# Codebase Audit — Technical Health

Engineering-side audit of the UHAS SMS codebase as of 2026-05-21. Items are technical debt or quality improvements, not features. Pair this doc with [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) (depth gaps in shipped features) and [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) (missing features entirely).

Last reviewed: 2026-05-21.

> Each item has effort, leverage, and a "what bites if we ignore it" — pick by impact, not order.

---

## 1. Database indexes — ✅ Done (PR #6, 2026-05-21)

Shipped in `drizzle/0003_wandering_lady_deathstrike.sql` — 17 indexes across 11 tables covering the queries below. Migration is additive; Drizzle picks indexes automatically with no application code change.

---

### Original findings (kept for reference)

**Findings:** only 1 explicit index across 30+ tables (the `notifications_user_read_idx` I added recently).

Common queries that currently scan or partial-scan:

| Query | Table | Frequency | Current cost |
|---|---|---|---|
| `where users.linkedId = ?` (every login fallback) | `users` | Every request that hits auth | Full table scan |
| `where students.schoolId = ? and classId = ?` | `students` | Class roster loads | Full scan filtered |
| `where attendance_sessions.classId = ? and date = ?` | `attendance_sessions` | Every attendance page | Full scan |
| `where scores.examId = ? and subjectId = ?` | `scores` | Score grid loads | Full scan |
| `where audit_log.action = ? and createdAt > ?` | `audit_log` | Every audit-log viewer load | Full scan |
| `where lesson_plans.teacherId = ? and status = ?` | `lesson_plans` | Teacher dashboard | Full scan |

### Why it bites later (not now)

At UHAS scale (a few thousand rows total) you don't feel it. At **10 schools × 5k rows = 50k rows**, the audit-log query alone takes seconds. At 20 schools, the staff-attendance load takes 10+ seconds.

**Real cost of fixing now:** ~3–5 hours, one migration. **Real cost of fixing later:** painful — production queries timing out, customer complaints, emergency optimization.

### Action

Add these in a single migration:

```ts
// users
index("users_linked_id_idx").on(users.linkedId)

// students
index("students_school_active_idx").on(students.schoolId, students.isActive)

// enrollments
index("enrollments_student_year_idx").on(enrollments.studentId, enrollments.academicYear)
index("enrollments_class_idx").on(enrollments.classId)

// classes
index("classes_school_year_idx").on(classes.schoolId, classes.academicYear)

// attendance_sessions
index("attendance_sessions_class_date_idx").on(attendanceSessions.classId, attendanceSessions.date)

// attendance_records
index("attendance_records_session_idx").on(attendanceRecords.sessionId)

// staff_attendance_sessions
index("staff_attendance_sessions_div_date_idx").on(
  staffAttendanceSessions.division,
  staffAttendanceSessions.date,
)

// scores
index("scores_exam_subject_idx").on(scores.examId, scores.subjectId)
index("scores_student_idx").on(scores.studentId)

// exams
index("exams_school_year_term_idx").on(exams.schoolId, exams.academicYear, exams.term)

// lesson_plans
index("lesson_plans_teacher_status_idx").on(lessonPlans.teacherId, lessonPlans.status)

// audit_log
index("audit_log_action_created_idx").on(auditLog.action, auditLog.createdAt)
index("audit_log_target_idx").on(auditLog.targetTable, auditLog.targetId)
index("audit_log_user_idx").on(auditLog.userId)

// announcements
index("announcements_school_created_idx").on(announcements.schoolId, announcements.createdAt)

// notifications already indexed
```

That's ~16 indexes covering the 10 worst hot paths. One migration.

---

## 2. 162 `any` / `ts-ignore` / `ts-expect-error` occurrences — `~30–60 h incremental`

**Findings:** 162 instances of `any`, `@ts-ignore`, or `@ts-expect-error` across the codebase. For a project this size, that's high — it means a fair amount of code escapes the type system.

### Why it bites

- Refactors miss things. Rename a field, TypeScript doesn't catch the usage that was cast to `any`.
- New developers (or future-you) waste time learning what types these places actually expect.
- Bug surface: anything past `as any` is a runtime gamble.

### Action

Incremental cleanup, not one big PR. Bucket the offenders and tackle 1 file at a time:

```bash
# Run this to bucket by file:
grep -rln "any\|@ts-ignore\|@ts-expect-error" src --include="*.ts" --include="*.tsx" | xargs -I{} sh -c 'echo "$(grep -c "any\|@ts-ignore\|@ts-expect-error" {}) {}"' | sort -rn | head -15
```

Take the top 10 worst offenders, fix in a PR per file. Each PR is ~30 min. Total effort: ~5 h to make a meaningful dent (clear the worst 10 of 162). Rest spread across normal feature work.

---

## 3. Hardcoded role strings — ✅ Done (PR #10, 2026-05-21)

On audit: looked closer than the headline 76-occurrence count suggested. Most sites were already type-narrowed comparisons (`role === "Admin"` against `UserRole`) — TS catches typos at those sites already.

Real shipped wins:
- Added `STAFF_SYSTEM_ROLES` + `StaffSystemRole` in `src/features/auth/types.ts` as a `readonly` tuple — doubles as a `z.enum()`-compatible literal.
- Replaced the only `as "Admin" | "DeputyHead" | "Teacher"` cast in `audience.ts`.
- De-duplicated identical role arrays in `StaffRegistrationForm`, `StaffDetail`, `UsersTable`.
- `AudienceSpec.roles` in `notifications/types.ts` now uses `StaffSystemRole[]` instead of an inline string union.

Pure comparison + filter sites (`eq(users.role, "Admin")`, `if (role === "Parent")`, etc.) were left as literals — TypeScript already narrows them. Display strings like `label: "Admin"` are intentionally separate and stay literal.

The convention going forward (per ENGINEERING-CONVENTIONS.md §7): **use exported constants when the value participates in a cast, array, or zod schema; bare literals are fine for type-narrowed comparisons.**

---

### Original findings (kept for reference)

**Findings:** 76 occurrences of literal `"Admin"` / `"Teacher"` / `"Parent"` / `"DeputyHead"` across the codebase. A `USER_ROLES` constant exists in `src/features/auth/types.ts` but isn't used everywhere.

### Why it bites

- Rename a role, miss 30 sites. Recently-added code paths (like notifications audience resolution) embedded role strings inline.
- Refactor risk grows with each new feature.

### Action

```bash
# Find the offenders:
grep -rn '"Admin"\|"Teacher"\|"Parent"\|"DeputyHead"' src --include="*.ts" --include="*.tsx" | grep -v "/types.ts" | grep -v "//"
```

Replace literal strings with the `UserRole` type values from `@/features/auth/types`. Run in one PR.

---

## 4. Zero soft-delete columns across 30+ tables — `~6–10 h`

**Findings:** every "delete" is either a hard `db.delete(...)` (lesson plans, scores) or an `isActive=false` toggle (staff, students). No `deletedAt` column anywhere.

### Why it bites

- A teacher accidentally deletes a lesson plan → no UI recovery, no audit trail of *what was deleted* (audit log records the action, not the row).
- A student record hard-deleted → years of attendance + scores orphaned (or also cascaded-deleted via foreign keys, which is worse).

### Action

Two paths:

**A.** Just add `deletedAt timestamp` to 4 high-risk tables (lesson_plans, scores, assignments, schemes). Update queries to filter out deleted rows. Add an admin "Trash" view that shows + restores deleted items. ~6 h.

**B.** Add soft-delete to ALL tables. ~10 h. More work for marginal value — most tables don't take hard deletes anyway.

**Recommendation:** A.

---

## 5. Inconsistent error handling between server actions — `~8–12 h`

**Findings:** some actions return `{ success: true } | { success: false, error: string }` (the typical pattern). Others throw `Error("...")`. Some return `null` for "not found", others throw. Some return `void` on success.

Examples in the codebase:

- `loginAction` → returns `{ success, redirect } | { success, error }` ✅
- `submitLessonPlanAction` → returns `{ success } | { success, error }` ✅
- `applyReview` (lesson plans) → returns `void`, throws on failure ❌
- `getSchoolSettings` → throws `Error("School row not found: ...")` ❌ (caught us in CI)
- `db.query.x.findFirst` → returns `null` (Drizzle default) — different convention

Callers handle this inconsistently — some `try/catch`, some check `success`, some assume the call works.

### Why it bites

- Adding a new feature, you don't know which pattern to follow.
- Error surfaces leak into the UI inconsistently (some show toasts, some show error pages, some silently fail).
- Hard to reason about failure modes.

### Action

**Pairs naturally with the deferred services-layer refactor**:

1. Establish one return convention for actions: `Promise<ActionResult<T>>` where `ActionResult<T> = { success: true; data: T } | { success: false; error: string; code?: string }`.
2. Establish one return convention for services: throw on unexpected errors (DB failures, etc.), return domain-shaped data on success.
3. Actions become thin adapters that try/catch service calls and map to the action result envelope.

Do this incrementally — pick one feature module (start with the one with the most consumers, e.g. `lesson-plans`), migrate, ship. Repeat for each feature module. ~2 h per module × 6 modules = ~12 h.

---

## 6. Loading + error boundaries — ✅ Done (PR #9, 2026-05-21)

The loading-state side turned out to be near-complete on inspection: **80 `loading.tsx` files** across the app (4 per role + per-route skeletons everywhere). Only auth pages without data fetches were skipped — appropriate.

The real gap was **error boundaries: zero in the entire app**. Shipped:

- `src/components/ui/error-state.tsx` — shared visual component (icon, title, description, `error.digest`, retry + home buttons)
- `src/app/(dashboard)/error.tsx` — catches all dashboard route errors inside the role layout (sidebar + header stay intact)
- `src/app/error.tsx` — catches non-dashboard routes (auth flows etc.), links back to login
- `src/app/global-error.tsx` — catastrophic boundary owning its own `<html>` + `<body>` with pure inline styles in case the design system itself failed to load

Going forward, any new route that does DB reads is covered by the parent boundary automatically. The [ENGINEERING-CONVENTIONS.md §14](ENGINEERING-CONVENTIONS.md) rule about adding `error.tsx` siblings can now be enforced PR-by-PR for routes that need closer-than-segment-level handling.

---

### Original findings (kept for reference)

**Findings:** 4 `loading.tsx` files (one per role dashboard). Zero `error.tsx` files. No skeletons on nested routes.

### Why it bites

- First page transition after a cold start shows a blank screen for 500–1500ms.
- Server-side errors fall through to the root error page (generic, not user-friendly).
- Specific routes that fetch a lot of data (admin overview, examinations review) feel slow on first load.

### Action

Add `loading.tsx` (skeleton) + `error.tsx` (graceful retry) to:

- `/admin/students` (350 rows)
- `/admin/staff`
- `/admin/audit-log`
- `/admin/examinations`
- `/teacher/lesson-plans`
- `/teacher/examinations/[examId]/[classId]/[subjectId]` (score entry)
- `/parent/results`

Each is ~30 min. Total ~6 h. Add the global `error.tsx` for unhandled cases (~1 h).

---

## 7. Memoization on hot list/grid components — ✅ Done (PR #10, 2026-05-21)

Shipped:
- **AttendanceSheet** — extracted `AttendanceRow` as a `memo`'d component. Per-cell state changes now re-render 1 row instead of 350. State handlers wrapped in `useCallback` so the row's prop refs are stable.
- **AuditEventRow** — wrapped the existing row component in `memo`. JSON-diff cost was real; filter operations on the parent no longer re-render every row.
- **StudentsTable** — wrapped the TanStack column definitions in `useMemo([isPending])`. Stable column refs across re-renders unlock TanStack's internal row memoization.

Deferred to a follow-up:
- **ScoreEntryGrid** — needs a `memo` wrapper on `ScoreCell` *plus* a refactor of the per-cell inline closures (`onChange={(v) => updateField(row.studentId, "cat1", v)}`) into stable handlers that take `studentId + field` as arguments. ~1.5h on its own; left out of this PR to keep scope tight.
- **NotificationsDropdown** — only ~10 items in the dropdown, polling refetch is the whole point. Skipping; cost vs benefit doesn't justify.

---

### Original findings (kept for reference)

## 7. 4 of ~60+ components use memoization — `~4–6 h targeted`

**Findings:** only 4 components use `useMemo` / `useCallback`. Most don't need to (premature optimization). But specific high-render-count surfaces would benefit:

| Component | Why |
|---|---|
| `AttendanceSheet` | 350+ rows re-render on every cell state change |
| `ScoresGrid` | per-class score entry, 30+ inputs in a table |
| `NotificationsDropdown` | polled every 60s, re-renders the whole list |
| `AuditLogTable` | 50 expandable rows with JSON diffs |
| `StudentsTable` | 350 rows with filters |

### Action

Targeted optimization for the 5 listed components. ~1 h each. Use `React.memo` on row components, `useCallback` for stable event handlers, `useMemo` for computed lists.

**Do not** sweep `useMemo`/`useCallback` across the whole codebase — that adds noise without measurable benefit for most components.

---

## 8. Date / time handling inconsistent — `~10–15 h`

**Findings:** dates are handled as raw strings or `Date` constructors inconsistently:

- Some places: `new Date().toISOString().split("T")[0]` to get "YYYY-MM-DD"
- Some places: `new Date(`${date}T00:00:00`)` (timezone-dependent)
- Some places: string concat to build dates
- Zero use of a library (date-fns / dayjs / luxon)

### Why it bites

- Timezone bugs are inevitable. We've already caught one (the `pg-connection-string` SSL warning was tangential, but timezone in attendance dates is a real risk: GMT vs Africa/Accra is 0h off, but UTC vs server-local on a UK Railway region IS 0h off, but on a US region is hours off).
- Hard to format dates consistently across the UI.
- Manual parsing is fragile.

### Action

Adopt `date-fns` (small footprint, tree-shakes well). Create a `src/lib/dates.ts` with the project's conventions:

```ts
// All dates stored as YYYY-MM-DD strings (date-only, no TZ).
// All timestamps stored as Date / ISO 8601.
// All display in Africa/Accra timezone (or school-configured later).

export function today(): string;
export function formatDate(d: string | Date, fmt?: string): string;
export function formatDateTime(d: string | Date, fmt?: string): string;
export function parseDate(s: string): Date;
export function daysBetween(start: string, end: string): number;
```

Then incrementally migrate callers. ~10–15 h total spread across features.

---

## 9. No background jobs / queues — defer

**Findings:** every server action is synchronous. Slow operations block the user's request:

- Announcement to 230 recipients = 230 synchronous inserts → ~500–1000ms
- Publishing exam results = N parent-notification inserts
- Bulk SMS send (when SMS gateway lands) = blocks the UI
- Bulk report card PDF generation (when that lands) = blocks the request

### When this bites

Not now — UHAS-scale operations finish in <1s. **At 10+ schools with concurrent bulk operations, you'll feel it.** Definitely before 30 schools.

### Action when needed

Adopt BullMQ + Redis (Railway has Redis as a service). Move audience fan-out, bulk PDF generation, bulk SMS to background jobs. ~20 h.

**Defer until volume justifies.** Document the trigger: "when any single user-facing action takes >2s to return, we have a problem".

---

## 10. No i18n infrastructure — defer

**Findings:** every UI string is a hardcoded English literal. No `next-intl` or similar.

### When this bites

If the school ever asks for Ewe or Twi labels for parents. Unlikely in basic-school market (English is the official school language in Ghana), but possible.

### Action when needed

Adopt `next-intl`. Extract strings to message files. ~20–30 h spread across components. **Defer until asked.**

---

## 11. Drizzle relations — ✅ Done (PR #7, 2026-05-21)

Shipped: `relations()` declarations added to `src/db/schema.ts` for 12 tables (users, staff, students, classes, enrollments, attendanceSessions, attendanceRecords, lessonPlans, schemes, exams, scores, announcements, notifications). The hottest path — `src/features/lesson-plans/actions/index.ts` — was migrated to use `with:` joins:

- `listLessonPlansForTeacherAction`: **4 round-trips → 1**
- `listLessonPlansForReviewAction`: **4 round-trips → 1**
- `getLessonPlanAction`: **4 round-trips → 1**
- `unitHeadReviewAction`, `deputyHeadReviewAction`: **3 round-trips → 2**
- `submitLessonPlanAction`: **2 round-trips → 1**

The `hydrateMany` + `attachAcademicYear` manual-batch pattern was removed entirely. Relations are now available for future refactors in other features (scores, attendance, etc.) without further schema work.

---

### Original findings (kept for reference)

**Findings:** schema uses foreign keys but no Drizzle `relations()` declarations. Queries that need joined data manually wire the join:

```ts
// Current pattern (everywhere):
const plan = await db.query.lessonPlans.findFirst({ where: eq(lessonPlans.id, id) });
const teacher = await db.query.staff.findFirst({ where: eq(staff.id, plan.teacherId) });
const subject = await db.query.subjects.findFirst({ where: eq(subjects.id, plan.subjectId) });
const cls = await db.query.classes.findFirst({ where: eq(classes.id, plan.classId) });
```

That's a classic N+1.

### Why it bites

- Each join is a separate round-trip. The lesson-plan page does 4. At Neon's ~5–10ms latency, that's 20–40ms per page just on join overhead.
- Hard to optimize without going through every query.

### Action

Define Drizzle relations once in `src/db/relations.ts`:

```ts
export const lessonPlansRelations = relations(lessonPlans, ({ one }) => ({
  teacher: one(staff, { fields: [lessonPlans.teacherId], references: [staff.id] }),
  subject: one(subjects, { fields: [lessonPlans.subjectId], references: [subjects.id] }),
  class: one(classes, { fields: [lessonPlans.classId], references: [classes.id] }),
}));
```

Then use `with` to join in one round-trip:

```ts
const plan = await db.query.lessonPlans.findFirst({
  where: eq(lessonPlans.id, id),
  with: { teacher: true, subject: true, class: true },
});
```

One PR, ~3–5 h. Could be incremental — define relations for the 5 most-joined tables first.

---

## 12. No caching strategy — `~5–8 h`

**Findings:** Next has multiple cache layers (`unstable_cache`, `revalidateTag`, `revalidatePath`, route-level `dynamic = 'force-cache'` / `'force-dynamic'`). We use `revalidatePath` in a few actions; nothing else.

### Why it bites

- Slow-changing data (school settings, classes, subjects, current academic year) is re-queried on every page render. Should be cached.
- We hit Neon on every request for things that change weekly at most.

### Action

Wrap the slow-changing reads in `unstable_cache` with a `revalidateTag`:

```ts
export const getSchoolSettings = unstable_cache(
  async () => { /* current impl */ },
  ["school-settings"],
  { tags: ["school-settings"], revalidate: 3600 },
);
```

Then settings-write actions call `revalidateTag("school-settings")` to bust the cache.

Apply to: school settings, classes, subjects, current academic year, school terms. ~5–8 h.

---

## 13. CI workflow could be tighter — `~2–4 h`

**Findings:** the workflow runs lint + tsc + tests + build on every PR. E2E only on push to main. That's mostly good, but:

- **No coverage reporting** — we have 142 tests; no idea what % of code they hit.
- **No bundle-size budget** — Next can grow a 5MB JS bundle silently.
- **No SAST / dependency scan** — `npm audit` would catch known CVEs in deps.
- **No `lint-staged` enforcement** — committers can bypass with `--no-verify`.

### Action

- Add `vitest --coverage` to the test job, upload to Codecov or just print the summary.
- Add `npm audit --omit=dev --audit-level=high` as a step.
- Add `@next/bundle-analyzer` to CI output (won't fail, just informs).

~2–4 h.

---

## 14. Email / SMS templates inline in actions — `~3–5 h` (when SMS lands)

**Findings:** the lesson-plan rejection email is constructed inline in `notifyTeacherOfRejection`. When more events get email/SMS, each one will inline its own template.

### Why it bites later

- Templates spread across N files; hard to maintain consistent voice/branding.
- Localization (if ever needed) means hunting through code.

### Action

Centralize into `src/lib/templates/` once we have >3 templates. Not urgent — handle when SMS gateway lands (which adds the next 4–5 templates).

---

## 15. Magic numbers and configuration in code — `~2–4 h`

**Findings:** assorted constants that should be configurable:

- Notification polling interval (60s) hardcoded in `NotificationsDropdown.tsx`
- Session cookie TTL (8h) hardcoded in `loginAction` (the admin-settings `sessionTimeoutMinutes` exists but **verify it's actually consumed**)
- Page sizes (50, 25, etc.) scattered
- File size limits (5 MB photos, 20 MB documents) in storage.rules + duplicated in UI checks

### Action

Consolidate into `src/lib/config.ts`. Settings that should be school-configurable belong in `schools` table; settings that are app-wide go in a TS constants file.

---

## Priority recommendations

If picking 1–2 to tackle alongside the commercial roadmap (no feature value, but real engineering leverage):

1. **DB indexes** (~3–5 h) — guaranteed performance win, ship in any PR.
2. **Drizzle relations** (~3–5 h) — pairs with indexes; removes N+1 patterns.

If picking a "quality quarter" between feature pushes:

3. **Loading + error boundaries** (~6–10 h) — visible UX quality.
4. **Caching strategy** (~5–8 h) — measurable Neon-cost reduction.
5. **Soft deletes (4 high-risk tables)** (~6 h) — backup safety net.
6. **Date/time consistency** (~10–15 h) — prevents timezone bugs that are hard to debug.

Defer until specifically painful or asked:

- `any` cleanup, role-constant cleanup, error handling normalization, services refactor, background jobs, i18n, bundle budgets, template centralization.

---

## Summary table

| Item | Effort | Leverage | Defer? |
|---|---|---|---|
| DB indexes | ~3–5 h | Very high | Do soon |
| Drizzle relations | ~3–5 h | High | Do soon |
| Loading + error boundaries | ~6–10 h | High UX | Soon |
| Caching strategy | ~5–8 h | Medium | Soon |
| Soft deletes | ~6–10 h | Safety | Medium |
| Date/time consistency | ~10–15 h | Medium-high | Medium |
| Memoization (5 components) | ~4–6 h | Medium UX | Medium |
| Error handling normalize | ~8–12 h | Medium (pair with services) | Medium |
| `any` cleanup (incremental) | ~5 h / dent | Low-medium | Background work |
| Role-constant cleanup | ~3–5 h | Low (refactor safety) | Background |
| CI tightening | ~2–4 h | Low (visibility) | Background |
| Magic numbers | ~2–4 h | Low | Background |
| Templates centralize | ~3–5 h | Low (when needed) | Wait |
| Background jobs | ~20 h | High (at scale) | Defer |
| i18n | ~20–30 h | None today | Defer |
| **Total if you did everything** | **~100–150 h** | | |

---

## Health metrics to track

After cleanup, watch:

- **Vitest coverage** — current ~60% guessed; target 75%.
- **Bundle size** — current ~1.2 MB JS (gzipped) guess; budget 1.5 MB.
- **p95 page-load time** on dashboard routes — target <800ms TTFB.
- **Neon DB cost** — current ~free tier; target <$5/mo per school after multi-tenancy.
- **`any` / `ts-ignore` count** — current 162; target <40.
- **Test pass time** — current ~14s Vitest + ~3min E2E; target <20s + <4min.
