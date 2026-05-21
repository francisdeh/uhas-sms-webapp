# DB Cutover — Design Spec

**Date:** 2026-05-19
**Branch target:** `feat/deffered-tasks` (or a follow-up branch)
**Status:** Approved for implementation

---

## 1. Purpose

The app currently runs every feature against in-memory mock fixtures in `src/lib/mock/`, gated by `USE_MOCK_DATA=true`. The Drizzle schema is fully defined and the Neon connection string is provisioned, but no action or query actually hits a database. This spec converts every feature to use the real PostgreSQL database via Drizzle, in a single big-bang PR.

After this PR:
- `src/lib/mock/` no longer exists.
- `USE_MOCK_DATA` no longer exists.
- Every action and query reads/writes through Drizzle.
- The school's demo data (every fixture currently in `src/lib/mock/`) is seeded into the DB by a single script so demos continue to work.
- Local Docker Postgres works end-to-end; Neon prod is the same code path with a different driver.
- Audit log writes are wired for the four sensitive admin mutations the original spec calls out.

---

## 2. Strategic decisions

| Dial | Decision |
|---|---|
| Sequencing | Big-bang single PR. `USE_MOCK_DATA` flag and mock files deleted at end. |
| DB driver | Env-var branching: `DB_DRIVER=pg` (local Docker + Railway) or `DB_DRIVER=neon-http` (Neon prod). Auto-detect `*.neon.tech` host as a fallback. |
| Seed | Full 1:1 port of every fixture in `src/lib/mock/` into `scripts/seed-db.ts`. |
| Audit log | Wired for `SCORE_OVERRIDE`, `STUDENT_EDIT`, `ROLE_CHANGE`, `PROMOTION_APPROVED`. No viewer UI in this PR (deferred). |
| Migrations | Generate baseline `drizzle/0000_init.sql`. New `db:migrate` script. `db:push` stays as a dev escape hatch. |
| View types | Hydrated view types stay (`Student.className`, `SchoolClass.classTeachers[]`, etc.). Query layer joins on read and constructs them via per-feature mappers. |
| Multi-tenancy | Implicit single-school for now; routed through `getCurrentSchoolId()` helper for future swapability. |
| Tests | Stay deferred to Phase 8. Cutover verified by manual demo walkthrough. |

---

## 3. DB connection + driver

Replace [src/db/index.ts](../../../src/db/index.ts):

```ts
import * as schema from "./schema";

type DbDriver = "pg" | "neon-http";

function resolveDriver(): DbDriver {
  const explicit = process.env.DB_DRIVER as DbDriver | undefined;
  if (explicit === "pg" || explicit === "neon-http") return explicit;
  const url = process.env.DATABASE_URL ?? "";
  return url.includes(".neon.tech") ? "neon-http" : "pg";
}

function makeNeon(url: string) {
  const { neon } = require("@neondatabase/serverless");
  const { drizzle } = require("drizzle-orm/neon-http");
  return drizzle(neon(url), { schema });
}

function makePg(url: string) {
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  return drizzle(new Pool({ connectionString: url }), { schema });
}

let _db: ReturnType<typeof makeNeon> | ReturnType<typeof makePg>;
export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _db = resolveDriver() === "neon-http" ? makeNeon(url) : makePg(url);
  return _db;
}
export const db = getDb();
```

**Dependency additions:** `pg`, `@types/pg`.
**Env var addition:** `DB_DRIVER` (default unset → auto-detect).
**Pool reuse:** Module-level `_db` cache handles Next.js dev HMR safely; the `pg` Pool can stay open across reloads.

---

## 4. Migrations

| Action | Command |
|---|---|
| Generate baseline | `npx drizzle-kit generate` once; commits `drizzle/0000_init.sql` |
| Apply migrations | `tsx scripts/migrate.ts` → runs Drizzle migrator against `DATABASE_URL` |
| Schema dev iteration | `npm run db:push` (unchanged) |
| Future migrations | `npm run db:generate` per schema change |

**Pre-cutover schema cleanup:** The four pre-existing junction tables using the deprecated `extraConfig` callback signature (`student_guardians`, `class_teachers`, `class_subjects`, `attendance_records`) get refactored to the array form in the same PR so the generated migration doesn't bake in deprecated SQL.

**Railway release step:** `npm run db:migrate && npm run db:seed:prod`.

---

## 5. Query/action conversion pattern

Every file in `src/features/*/actions/*.ts` and `src/features/*/queries/*.ts` gets rewritten. The pattern is consistent across all 26 files:

### Conventions

| Rule | Why |
|---|---|
| Every query takes `schoolId` from `getCurrentSchoolId()` and filters by it | Multi-tenant safety; CLAUDE.md requires it |
| Drizzle table imports aliased to avoid view-type name clashes (e.g. `exams as examsTable`) | View types stay; only the internal collision is renamed |
| Hydrated fields (`className`, `submittedByName`, etc.) populated via per-file `to<Name>(...)` mappers | Keeps UI unchanged; centralises denormalisation |
| Writes touching ≥2 tables wrap in `db.transaction(async (tx) => { ... })` | All-or-nothing |
| Validation via Zod schemas co-located with each action | Maintains the existing form-validation pattern |
| Action returns `{ success: true } \| { success: false; error: string }` | UI contract unchanged |
| `revalidatePath` called after each mutation | Server Components need explicit invalidation now that data isn't in-memory |
| `process.env.USE_MOCK_DATA` checks deleted; mock imports deleted | Goal of the PR |

### Worked example — joined read

`listSubmissionsForExamAction` becomes a Drizzle query with a `leftJoin` on `staff`:

```ts
const rows = await db
  .select({
    submission: classReportSubmissionsTable,
    submitter: { firstName: staffTable.firstName, lastName: staffTable.lastName },
  })
  .from(classReportSubmissionsTable)
  .leftJoin(staffTable, eq(staffTable.id, classReportSubmissionsTable.submittedById))
  .where(eq(classReportSubmissionsTable.examId, examId));
return rows.map(({ submission, submitter }) => ({
  ...submission,
  submittedByName: submitter
    ? `${submitter.firstName} ${submitter.lastName}`
    : null,
}));
```

### Worked example — promotion approval (transaction + audit log)

`approveSubmissionAction` materialises real enrollments in a transaction and writes one audit log row:

```ts
await db.transaction(async (tx) => {
  const sub = await tx.query.promotionSubmissions.findFirst({
    where: eq(promotionSubmissionsTable.id, submissionId),
  });
  if (sub?.status !== "submitted") throw new Error("Already approved");

  const decisions = await tx.query.promotionDecisions.findMany({
    where: eq(promotionDecisionsTable.submissionId, sub.id),
  });

  // 1. Close current-year enrollments
  await tx.update(enrollmentsTable)
    .set({ status: "Completed" })
    .where(and(
      eq(enrollmentsTable.academicYear, sub.academicYear),
      inArray(enrollmentsTable.studentId, decisions.map(d => d.studentId)),
      eq(enrollmentsTable.status, "Active"),
    ));

  // 2. New enrollments for Promote + Repeat
  const promoteRepeat = decisions.filter(d => d.decision === "promote" || d.decision === "repeat");
  if (promoteRepeat.length > 0) {
    await tx.insert(enrollmentsTable).values(promoteRepeat.map(d => ({
      studentId: d.studentId,
      classId: d.targetClassId!,
      academicYear: nextAcademicYear(sub.academicYear),
      status: d.decision === "repeat" ? "Repeating" : "Active",
      enrollmentDate: new Date().toISOString().slice(0, 10),
    })));
  }

  // 3. Withdraw → students.isActive = false
  const withdraws = decisions.filter(d => d.decision === "withdraw");
  if (withdraws.length > 0) {
    await tx.update(studentsTable)
      .set({ isActive: false })
      .where(inArray(studentsTable.id, withdraws.map(d => d.studentId)));
  }

  // 4. Submission status + audit log
  await tx.update(promotionSubmissionsTable)
    .set({ status: "approved", reviewedById, reviewedAt: new Date() })
    .where(eq(promotionSubmissionsTable.id, sub.id));

  await writeAuditLog(tx, {
    userId: reviewedById,
    action: "PROMOTION_APPROVED",
    targetTable: "promotion_submissions",
    targetId: sub.id,
    after: { decisionCount: decisions.length },
  });
});
```

This is the conversion shape repeated across all 26 files — no new behaviour, same inputs, same return shapes, same UI.

---

## 6. Seed script

`scripts/seed-db.ts` is the last consumer of `src/lib/mock/`. Once it has run successfully once and inserts are verified, the mock directory is deleted in the same PR.

### Insert order (FK-dependent)

```
1.  schools           ← mockSchool
2.  staff             ← mockStaff
3.  users             ← mockUsers (Firebase UID as PK; linkedId from mock)
4.  students          ← mockStudents (drop className/division/classId — denormalised)
5.  guardians         ← mockGuardians
6.  student_guardians ← mockStudentGuardians
7.  subjects          ← mockSubjects
8.  classes           ← mockClasses (drop classTeachers[] — junction)
9.  class_teachers    ← extracted from mockClasses[].classTeachers
10. class_subjects    ← mockClassSubjects (drop denormalised names)
11. enrollments       ← derived: one Active row per active student in their current classId; Completed for inactive
12. exams             ← mockExams
13. scores            ← mockScores
14. attendance_sessions + attendance_records ← mockAttendance
15. lesson_plans      ← mockLessonPlans
16. schemes           ← mockSchemes
17. assignments       ← mockAssignments
18. announcements     ← mockAnnouncements
19. appointments      ← mockAppointments
20. calendar_events   ← mockCalendarEvents
21. class_report_submissions + student_report_remarks ← (empty in current mock)
22. promotion_seasons + promotion_submissions + promotion_decisions ← (empty in current mock)
23. leave_requests    ← mockLeaveRequests
```

### Flags

| Flag | Effect |
|---|---|
| `--reset` | Truncate all tables first. Refuses to run when `NODE_ENV=production`. |
| `--idempotent` | `ON CONFLICT (id) DO NOTHING`. Safe to re-run. Used in Railway release. |
| `--no-demo` | Inserts only `schools` + `staff` + `users` (the minimum needed for production logins). |

### npm scripts

```json
"db:seed": "tsx scripts/seed-db.ts --idempotent",
"db:seed:reset": "tsx scripts/seed-db.ts --reset",
"db:seed:prod": "tsx scripts/seed-db.ts --idempotent --no-demo"
```

### `enrollments` derivation

Each mock student carries a `classId` (the current-year class). The seed synthesises one `enrollments` row per student:

```ts
{
  studentId: student.id,
  classId: student.classId,
  academicYear: "2025/2026",
  status: student.isActive ? "Active" : "Completed",
  enrollmentDate: student.createdAt.slice(0, 10),
}
```

After the seed runs, the DB is canonical and `student.classId` no longer exists as a field — every query goes through `enrollments`.

---

## 7. Audit log helper

New module `src/lib/audit-log.ts`:

```ts
import { auditLog } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";

export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED";

export async function writeAuditLog(
  tx: TransactionLike,
  input: {
    userId: string;
    action: AuditAction;
    targetTable: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  await tx.insert(auditLog).values({
    schoolId: await getCurrentSchoolId(),
    userId: input.userId,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId,
    before: input.before ? JSON.stringify(input.before) : null,
    after: input.after ? JSON.stringify(input.after) : null,
  });
}
```

Takes either the `db` client or a transaction handle so callers inside a transaction don't write to a separate connection.

**Call sites (4 total):**

| Action | Where | Recorded |
|---|---|---|
| `SCORE_OVERRIDE` | `saveScoresAction` — only when admin edits a row that already had a `totalScore` | before: full score row. after: full score row. |
| `STUDENT_EDIT` | `updateStudentAction` — Admin only | before: full student row. after: patched fields only. |
| `ROLE_CHANGE` | Wherever `staff.systemRole` flips | before/after of `systemRole`. |
| `PROMOTION_APPROVED` | `approveSubmissionAction`, inside the existing tx | after: count of decisions per kind + IDs of new enrollments. No `before` — one-shot. |

No viewer UI in this PR. Listed under deferred follow-ups (section 11).

---

## 8. View-type strategy

Hydrated view types stay unchanged. Per-feature mappers handle denormalisation on read.

| Denormalised field | Source | Mapper |
|---|---|---|
| `Student.classId / className / division` | Most-recent `enrollments` row where `status='Active'`, joined with `classes` | `toStudent` in students queries |
| `SchoolClass.classTeachers[]` | `class_teachers` ⋈ `staff` grouped by class | `toClass` in classes queries |
| `ClassSubject.subjectName / teacherName` | `class_subjects` ⋈ `subjects` + `staff` | `toClassSubject` |
| `LessonPlan.teacherName / subjectName / className / division` | `lesson_plans` ⋈ `staff` + `subjects` + `classes` | `toLessonPlan` |
| `*.submittedByName / reviewedByName` | `staff` join on the ID FK | inline mapper in each query file |

**N+1 avoidance:** every list query joins everything it needs in one round-trip. No mapper triggers a follow-up DB call.

**New helper:** `getActiveEnrollmentMap(studentIds[], academicYear) → Map<studentId, { classId, className, division }>` — called once per list page to populate student view types.

---

## 9. Mock removal + cleanup checklist

End of the PR, before opening for review:

| Removed | Why |
|---|---|
| `src/lib/mock/` (21 files) | Sole consumer is the seed script, which has run |
| `process.env.USE_MOCK_DATA` checks in 26 files | Flag deleted |
| `USE_MOCK_DATA` from `.env.local.example` | Same |
| Mock-array mutation patterns (`mockExams.push(...)`, etc.) | No longer compiles |
| `mockSchool` reads in `getCurrentAcademicYear()` | Replaced with `db.query.schools.findFirst()` cached per-request |

**Added:**

| File | Purpose |
|---|---|
| `src/lib/school.ts` | `getCurrentSchoolId()` helper — hardcoded `school-uhas-001` for now, routed through one helper for future per-session resolution |
| `src/lib/audit-log.ts` | `writeAuditLog()` helper |
| `scripts/seed-db.ts` | Full 1:1 mock port |
| `scripts/migrate.ts` | Drizzle migrator runner |
| `drizzle/0000_init.sql` + `drizzle/meta/_journal.json` | Baseline migration |

**Updated:**

| File | Change |
|---|---|
| `src/db/index.ts` | Driver branching |
| `src/db/schema.ts` | Deprecated `extraConfig` callback signature fixed on 4 junction tables |
| `src/features/auth/queries/get-session-user.ts` | Reads user + staff from DB instead of mock |
| `src/features/auth/actions/login.ts` | Populates session from DB |
| `src/lib/academic-year-server.ts` | Reads from `schools` table |
| `scripts/seed-emulator-users.ts` | Reads from `db.query.users` instead of `mockUsers` |
| `package.json` | + `pg`, `@types/pg`; + `db:migrate`, `db:generate`, `db:seed*` scripts |
| `.env.local.example` | + `DB_DRIVER`; − `USE_MOCK_DATA` |
| `railway.toml` | + release step (`db:migrate && db:seed:prod`) |
| `README.md` | Setup section rewritten; `USE_MOCK_DATA` removed; `DB_DRIVER` documented; seed step added |
| `docs/implementation-spec.md` | "Next steps: DB cutover" line resolved; deferred list updated |

---

## 10. Verification

Manual demo walkthrough at end of PR. No automated tests in scope (Phase 8 is the testing phase).

1. `docker compose down -v && docker compose up -d` → fresh Postgres.
2. `npm run db:migrate` → all tables created.
3. `npm run db:seed` → idempotent insert of every fixture.
4. `firebase emulators:start && npm run seed:emulator` → Firebase auth users.
5. `npm run dev` → boots; `rg "from \"@/lib/mock"` returns zero matches; `rg USE_MOCK_DATA` returns zero matches.
6. Per-role flow check (~25 minutes):
   - Admin: login → students list → register student → edit → deactivate → reactivate; staff list + edit; classes + subjects; examinations create + publish; class reports review; announcements; calendar; promotions open/close season; reports dashboards; PSC report.
   - Deputy Head: login → attendance; leave approvals; lesson plans review; promotions review.
   - Teacher (with class-teacher flag): login → attendance mark; lesson plans create/submit; schemes; assignments; score entry; class reports; promotions list submit.
   - Parent: login → child profile; attendance calendar; results; assignments; announcements; appointments.
7. `tsc --noEmit` and `npm run lint` both clean.
8. Persistence check: restart dev server. Demo data still there. Edit a student. Restart. Edit persists.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Seed runs partially, leaving FK violations | All inserts inside one transaction. Failure → rollback → DB empty, re-run cleanly. |
| Drizzle result shape doesn't match a hydrated view type exactly (null/undefined drift, JSON-vs-string) | Per-file mapper is the single conversion point; TypeScript catches mismatches at build time. |
| `pg` driver leaks connections on Next.js dev HMR | Module-level `_db` cache + single `Pool` instance per process. |
| `enrollments`-derived `student.classId` stale after class transfer | `transferStudentAction` already creates new enrollment + closes old; `revalidatePath('/admin/students')` after the mutation. |
| Promotion approval transaction is large | All in one Drizzle transaction; worst case is ~30 students per class — well within Postgres single-tx limits. |
| Missed mock import | End-of-PR grep gate: `rg "from \"@/lib/mock"` must return zero. |
| Railway prod accidentally runs `--reset` | Seed script refuses `--reset` when `NODE_ENV=production`. Release step uses `db:seed:prod`. |

---

## 12. Deferred follow-ups (called out in this spec, not done in this PR)

1. **Audit log viewer UI** — `/admin/audit-log` page showing the `audit_log` table with filters (action, actor, target). Table is write-only after this PR; viewer is a separate small effort.
2. **File uploads to real cloud storage** — `lesson_plans.fileUrl`, `schemes.fileUrl`, `assignments.fileUrl`, `students.photoUrl`, `staff.photoUrl` are currently free-text columns. Real uploads (Firebase Cloud Storage per the original tech stack table) and signed URL handling are a separate effort.
3. **Phase 1 auth deferrals** — `sendPasswordResetEmail` wiring and session expiry warning modal stay deferred. `mustChangePassword` enforcement is wired in this PR as part of the auth conversion: `getSessionUser` reads it from the `users` table, and `loginAction` honours the flag (redirect to `/change-password`).
4. **6c — SendGrid email notifications** via Cloud Functions for critical announcements and appointment notifications.
5. **Phase 8 — Testing** — per-feature Vitest + RTL + Playwright tests as originally planned.

---

## 13. Success criteria

1. With `USE_MOCK_DATA` removed and `src/lib/mock/` deleted, the entire app builds, lints, and type-checks cleanly.
2. `npm run db:migrate && npm run db:seed` against a fresh local Postgres reproduces the current demo state — every role can log in and every page renders with the same data as today.
3. Every mutation persists across a dev server restart.
4. The promotion approval flow actually materialises new `enrollments` rows (verifiable in Adminer / Drizzle Studio).
5. The four audit-log events write rows on the relevant admin mutations.
6. Railway deployment works end-to-end: `db:migrate` runs on release, app boots against the deployed DB, login works.
7. Production Railway deployment can be brought up with `db:seed:prod` (minimum data only — no demo fixtures bleeding into a real school's DB).
