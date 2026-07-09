# UHAS SMS — Implementation Spec

**Version:** 1.1  
**Date:** 2026-04-26  
**Source documents:** SRS v1.0, Drizzle Schema Doc, First Prompt.md

---

## 0. Local Development Strategy

### Mock Data
All feature modules that are not yet connected to the real database use static TypeScript fixture files at `src/lib/mock/<feature>.ts`. Server Actions check a `USE_MOCK_DATA=true` env var (set in `.env.local`) and short-circuit to return fixtures instead of hitting Neon. This lets UI and workflows be built and iterated on independently of DB setup.

Modules that use mock data initially:
- Students, Staff, Classes, Subjects
- Attendance sessions and records
- Exams and Scores
- Lesson Plans
- Announcements

Mock data is removed module-by-module as real DB + Server Actions are wired up in later phases. Mock files are never imported in production (`NODE_ENV=production` ignores the flag).

### Auth — Firebase Local Emulator
During development, Firebase Authentication runs on the **Firebase Local Emulator Suite** (port 9099). No live Firebase project or credentials are needed until deployment.

Setup:
```bash
npm install -g firebase-tools
firebase init emulators   # select Authentication
firebase emulators:start
```

The app detects the emulator via `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` in `.env.local` and points the Auth SDK at `http://localhost:9099`. Sign-in, session tokens, and role-based routing all work identically to production.

Seed users (one per role) are created via the Emulator UI or a `scripts/seed-emulator-users.ts` script run at dev startup.

---

## 1. Resolved Tech Stack

| Layer | Decision |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui + lucide-react |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Drizzle ORM — schema at `src/db/schema.ts` |
| Auth | Firebase Authentication (email/password) |
| File Storage | Firebase Cloud Storage (lesson plans, photos, PDFs) |
| Push / Email | Firebase Cloud Messaging + SendGrid via Cloud Functions |
| Server Mutations | Next.js Server Actions |
| Client Data | TanStack Query v5 (cache, optimistic UI) |
| Toasts | Sonner |
| Hosting | Railway |

> **Firestore vs PostgreSQL:** The SRS listed Firestore. The Drizzle schema doc supersedes this — all relational data lives in Neon PostgreSQL. Firebase is used only for Auth, Storage, and push notifications.

---

## 2. Project Structure (Feature-Based)

```
src/
├── app/                        # Next.js App Router pages
│   ├── (auth)/                 # Unauthenticated pages
│   │   ├── login/
│   │   ├── reset-password/
│   │   └── change-password/
│   ├── (dashboard)/            # Role-specific dashboards
│   │   ├── admin/
│   │   ├── deputy-head/
│   │   ├── hod/
│   │   ├── teacher/
│   │   └── parent/
│   └── layout.tsx              # Root layout with Providers + Toaster
├── components/
│   └── ui/                     # shadcn/ui primitives
├── features/                   # Domain modules (one folder per feature)
│   ├── auth/                   # Login, session, user management
│   ├── shell/                  # Dashboard layout, Sidebar, Header, nav config
│   ├── profile/                # User profile + security settings
│   ├── students/
│   ├── staff/
│   ├── classes/
│   ├── attendance/
│   ├── exams/
│   ├── lesson-plans/
│   ├── announcements/
│   └── reports/
├── db/
│   ├── index.ts                # Neon + Drizzle client
│   └── schema.ts               # All table definitions
└── lib/
    ├── firebase.ts             # Firebase app init
    └── utils.ts
```

Each `features/<name>/` folder contains:
- `components/` — UI specific to that feature
- `actions/` — Server Actions (mutations)
- `queries/` — Server-side query functions (called by Server Components or TanStack Query)
- `types.ts` — TypeScript types for that domain

---

## 3. Database Schema Summary

All tables include `schoolId` for multi-tenant scoping.

| Table | Purpose |
|---|---|
| `schools` | School config, academic year, current term, grading scale |
| `users` | Firebase UID bridge, role, `linkedId` to staff/student/guardian |
| `staff` | Teacher and admin profiles, division, system role |
| `students` | Student profiles — no `classId` here (use enrollments) |
| `guardians` | Parent/guardian profiles, linked to students via junction |
| `student_guardians` | Junction: student ↔ guardian (supports multiple guardians) |
| `classes` | Class per academic year, class teacher assignment |
| `subjects` | Subjects with division scope (JHS/Primary/KG) |
| `class_subjects` | Junction: which teacher teaches which subject in which class |
| `enrollments` | Student ↔ class per academic year — enables promotion history |
| `attendance_sessions` | One row per class per day |
| `attendance_records` | One row per student per session (present/absent/late + note) |
| `lesson_plans` | Teacher plans with status workflow (draft → submitted → approved/rejected) |
| `exams` | Exam definition (Mid-Term, End-of-Term), publishable by Admin |
| `scores` | Per student per subject per exam — classScore + examScore → totalScore + grade |

---

## 4. User Roles & Dashboard Routing

| Role | Login Redirect | Key Actions |
|---|---|---|
| Admin (Head of School) | `/admin` | Full access — register students/staff, publish results, send announcements |
| Deputy Head | `/deputy-head` | Division scope — approve lesson plans, mark staff attendance, view reports |
| Subject Head / HOD | `/hod` | Department scope — first reviewer for JHS lesson plans |
| Teacher / Class Teacher | `/teacher` | Mark student attendance, enter scores, create lesson plans |
| Parent / Guardian | `/parent` | Read-only — child profile, results, attendance, announcements |

The routing proxy (`proxy.ts`) reads the user's role from the session cookie and redirects to the correct dashboard on login.

---

## 5. Feature Module Details

### 5.1 Auth
- Email/password login via Firebase Auth
- First-login password change enforced (flag on `users.mustChangePassword`)
- Rate-limiting: 5 failed attempts → 10-minute lockout (Firebase Auth built-in)
- Session: 8-hour expiry, 5-minute warning modal with extend option
- Admin can reset any school user's password

### 5.2 Student Management
- Registration form with required + optional fields
- Auto-generated Student ID: configurable format (default `UHAS-[YEAR]-[SEQ]`), immutable once set
- Soft-delete (deactivate) — hidden from active lists, retained in DB
- Class transfers within the same academic year (new enrollment row, previous marked `Completed`)
- Printable ID card PDF: photo, name, student ID, class, academic year, school logo
- Audit log on all admin edits

### 5.3 Staff Management
- Registration creates both a `staff` record and a `users` account
- Welcome email with credentials sent via SendGrid on registration
- Role & subject/class assignments managed by Admin
- Staff can update limited profile fields (not role or assignment)

### 5.4 Class & Subject Management
- Admin creates classes per academic year (KG 1–2, Primary 1–6, JHS 1–3)
- Admin creates subjects and links to divisions
- `class_subjects` junction assigns teachers to subjects per class
- Class Teacher assigned per class (owns daily attendance)

### 5.5 Attendance
- **Student:** Class Teacher marks present/absent/late per student per day; editable same day only; Admin override for past dates
- **Staff:** Deputy Head marks staff in their division daily
- **Leave requests:** Staff submit → Deputy Head approves → auto-reflected in attendance
- Leave types: sick leave, maternity, days off (wedding/funeral/special occasion)
- Parent view: child's attendance as % + calendar

### 5.6 Exams & Results
- Admin configures exam types, GES grading scale (adjustable), score components + weights (class score 30% / exam score 70%)
- Teachers enter scores for their subjects — locked after Admin publishes
- Auto-compute: `totalScore`, `grade`, `interpretation`, `subjectPosition` on score save (Server Action)
- Admin override with audit trail
- Report card PDF: scores, grades, remarks, attendance summary, teacher comment, head's comment
- Head of School reviews + approves report cards before Admin publishes
- Parents see: class-level performance vs peers, subject trends across years

### 5.7 Student Promotion
- Class Teacher triggers promotion at year end → Deputy Head approves
- System generates promotion list based on scores
- Repeating a student requires a reason + sign-off from HOD/Deputy Head
- Finalised list: creates new `enrollment` rows for next year's classes
- Historical class data preserved in `enrollments` table

### 5.8 Lesson Plans & Schemes of Work
- Teachers create SoW (term-level) and weekly lesson plans
- File uploads (PDF/DOCX/PPTX) to Firebase Cloud Storage
- Status workflow: `draft` → `submitted` → `approved` / `rejected`
- Approval chain:
  - JHS: Teacher → Subject Head (HOD) → Deputy Head JHS
  - Primary: Teacher → Deputy Head Primary
  - KG: Teacher → Deputy Head KG
- Reviewer can approve, reject with comment, or request changes
- Notifications sent on status change (in-app + email)

### 5.9 Announcements & Communication
- Admin: school-wide announcements
- Deputy Heads: division-level announcements
- Critical announcements → email to relevant recipients
- Parents notified: new announcements, published results, low attendance alerts
- Report cards emailed to parents at term end (Admin-triggered)

### 5.10 Reports & Analytics
- Admin dashboard: total students, today's attendance rate, pending lesson plan approvals, recent announcements
- Academic year switcher — all data views filterable by year
- Student performance report: avg score per subject, pass/fail rates, top/bottom performers
- Attendance summary: school/class/division level, filterable by date range
- Lesson plan compliance: submission rate per week/term
- PSC report (for Head of School): total population, boys/girls per class, leavers, teachers per department
- All reports exportable as PDF or printable
- Academic calendar: visible to all users — learning weeks, events, exam dates

---

## 6. School Structure (Resolved)

```
Head of Basic School
├── Deputy Head — JHS
│   └── Subject Heads (HODs) → Subject Teachers
├── Deputy Head — Primary
│   └── Class Teachers (Primary 1–6)
└── Deputy Head — KG/Pre-School
    └── Class Teachers (KG 1–2)

Cross-cutting:
├── Admin (Head of School's office)
├── Accountant
└── PSC (external — no system access)
```

Classes: KG 1, KG 2, Primary 1–6, JHS 1–3

---

## 7. Implementation Phases

| Phase | Duration | Deliverables |
|---|---|---|
| **0 — Foundation** | 1 week | ✅ Firebase emulator setup, Drizzle schema file, root layout with Providers + Toaster, auth middleware skeleton, mock data fixtures, Railway deployment config (`railway.toml`); Neon DB provisioned but migrations deferred until Phase 1 |
| **1 — Auth & User Management** | 2 weeks | ✅ Login, reset-password, change-password pages (all using shadcn + react-hook-form + Zod); role-based routing via proxy.ts; session cookie pipeline (uid, role, email, linkedId, expires_at); Admin user management UI — stats bar, DataTable with filter pills, create/edit modal, deactivate confirmation, invite-link flow; dashboard shell — Sidebar, Header, academic year switcher, global search (⌘K), notifications, dark mode toggle; per-role profile + security settings pages. Non-admin role dashboards (Deputy Head, Teacher, Parent) built with role-scoped content and live attendance stats. Firebase custom claims pipeline wired: `seed:firebase` script seeds production users. Reset-password wired to Firebase `sendPasswordResetEmail`. `mustChangePassword` read from DB and enforced in `loginAction`. Session expiry warning: `SessionExpiryWatcher` in `DashboardLayout` reads `session_expires_at` cookie, shows an AlertDialog 5 min before expiry with a live mm:ss countdown and Extend (re-issues all session cookies for 8h via `extendSessionAction`) / Sign out buttons. |
| **2a — Student Records** | 1 week | ✅ Student list (Admin + Deputy Head scoped), registration form, soft-deactivate/reactivate, division + status filter pills. All on mock data. |
| **2b — Student Detail & ID Card** | 1 week | ✅ Student detail view, edit profile, class transfer (with AlertDialog confirmation), printable ID card (browser print + @media print CSS). All on mock data. |
| **2c — Staff Management** | 1 week | ✅ Staff list (Admin-scoped, role + status filter pills), registration form with invite-link flow, staff detail with edit/change-role/deactivate/reactivate. All on mock data. |
| **2d — Classes & Subjects** | 1 week | ✅ Class list + create (fixed name set), subject list + create, class detail with Subjects & Teachers table (add subject, assign teacher per subject), student roster, change class teacher. All on mock data. |
| **3 — Attendance** | 2 weeks | ✅ Student daily attendance (teacher + admin mark/view with session history), staff attendance + leave requests (deputy head approve/reject), parent read-only calendar view with monthly navigation. Live attendance stats wired to Teacher, Deputy Head, and Parent dashboards. All on mock data. |
| **3.5 — Model Reconciliation** | 3 days | ✅ Post-feedback realignment before Phase 4. Division split (KG / Lower Primary / Upper Primary / JHS); HOD dropped from `UserRole` and `/hod` route removed; Unit Head added as a staff flag (`isUnitHead` + `unitHeadOf`) with conditional Teacher sidebar nav (Department, Reviews); `class_teachers` junction (multiple class teachers per class); staff `uhasId` + student `middleName` + photo URLs; school grading scale switched to the report-card bands (Highest..Lowest, 1–9); attendance UX: bulk "Mark all present" + required `lateReason` (status enum simplified to present / late / absent). |
| **4a — Score Entry** | 1 week | ✅ Scoring schema: `scores.cat1/cat2/projectWork/groupWork` columns alongside `examScore`. Feature utils for `computeTotalScore` (Mid-Term raw 100; End-of-Term placeholder 60% exam + 4×10% components), `computeGrade`, `assignSubjectPositions`, `computeAggregate`. Admin `/admin/examinations`: list + create exam (type / term / academic year) + publish/unpublish (locks/unlocks score editing). Teacher `/teacher/examinations`: lists exams + the teacher's class×subject cells, drills into a score-entry grid with auto-computed total/grade and position recomputed on save. |
| **4b — Report Card** | 1 week | ✅ Server-rendered, browser-printable report card matching the school's template. Component reads from `getReportCardData(studentId, examId)` and renders student info, Core/Elective subject tables, AGGREGATE (sum of grades), ATTENDANCE (present+late ÷ total), Class Teachers' Remarks/Names/Signature, Head of School's Signature, GES interpretation footer, motto. Parent route `/parent/results/[studentId]/[examId]` shows only **published** exams; Admin route `/admin/students/[id]/report-card/[examId]` works for any exam with an "unpublished" notice. Print CSS scoped to `#report-card-print-area` at A4. KG-specific variant still to do. |
| **4c — Workflow** | 1 week | ✅ Two new tables: `class_report_submissions` (id, examId, classId, status, submittedById, submittedAt) and `student_report_remarks` (examId, studentId, classTeacherRemark, headOfSchoolComment). Class Teacher route `/teacher/class-reports`: lists exams × the teacher's class-teacher classes with submission status (Draft / Submitted); per-class form requires a remark per student before submission. Admin route `/admin/examinations/[examId]/review`: lists classes with submission status; per-class review shows each student's class-teacher remark in read-only and a Head of School comment textarea (per-student save). Report card pulls remark + comment into the rendered template. Publishing the exam locks both. |
| **5a — Lesson Plans** | 1 week | ✅ `features/lesson-plans` feature with types, mocks, actions, and components. Status enum `draft → submitted → unit_head_approved → approved` (or `rejected` at any review step). Teacher routes: `/teacher/lesson-plans` (list), `/teacher/lesson-plans/new` (create), `/teacher/lesson-plans/[id]` (edit). Reviewer routes: `/teacher/reviews` (Unit Heads only — pulls plans with `division === user.unitHeadOf` and status `submitted`), `/deputy-head/lesson-plans` (Deputy Heads — pulls plans with `division === user.division` and status `unit_head_approved`). `unitHeadReviewAction` + `deputyHeadReviewAction` validate role + division before transitioning. Teacher edits on rejected/submitted plans reset status to draft. `getSessionUser` now populates `isUnitHead` / `unitHeadOf` from staff data so the conditional Teacher sidebar nav (Department, Reviews) and gating on `/teacher/reviews` work. |
| **5b — Schemes of Work / Scheme of Learning** | 0.5 week | ✅ New `schemes` table (id, teacherId, classId, subjectId, type, term, academicYear, title, fileUrl, content, status, reviewer fields). Status: `draft → submitted → acknowledged`. Teacher `/teacher/schemes` flows: list, new, edit. Form lets teacher write term content directly (per-week template) OR paste an upload URL — at least one is required. Admin `/admin/schemes` is the Head of School review queue with expand-to-preview, optional comment, and Acknowledge. |
| **5c — Assignments** | 0.5 week | ✅ New `assignments` table (id, teacherId, classId, subjectId, title, description, fileUrl, dueDate, status: `draft \| published`). Teacher `/teacher/assignments` flows: list, new, edit, publish, unpublish, delete. Parent `/parent/assignments` aggregates published assignments for every linked child's class, surfaces due-date state (overdue / today / upcoming), per-child attribution, and the optional attachment link. |
| **6a — Announcements** | 0.5 week | ✅ `features/announcements` with `Announcement` type (audience string of form `all` \| `division:<D>` \| `class:<id>`). Server actions for list, create, delete with role-scoped audience validation. Three views: Admin (full audience picker + delete-any), Deputy Head (locked to own division), Parent (auto-filtered to school-wide + announcements matching any linked child's division/class). |
| **6b — Parent-Teacher Appointments** | 0.5 week | ✅ New `appointments` table (guardianId, studentId, teacherId, preferredDate, preferredSlot, reason, status, teacherResponse). Status transitions: `pending → confirmed`/`declined` (teacher) or `→ cancelled` (parent). Parent picker pulls teachers who teach the child (subject teachers + class teachers via the new junction). Decline requires a reason; confirmation can include an optional message. |
| **6c — Email notifications** | ✅ (minimum) | Provider-agnostic email module at `src/lib/email.ts` (nodemailer transport, swappable in one place). Wired to Gmail SMTP for now via `SMTP_HOST/PORT/USER/PASS` env vars; if those are unset, emails are logged to stdout — safe for dev, CI, and tests. First consumer: lesson-plan rejection (both Unit Head and Deputy Head) emails the teacher with the reviewer's comment + a link to the plan. Bulk sends + bounce/open analytics will need a swap to Resend/SendGrid later; Gmail's ~500/day personal quota (~2,000/day Workspace) is fine for current notification volume. Reset-password emails are not in this path — Firebase Auth sends those itself. |
| **7a — Reports dashboards** | 1 week | ✅ `features/reports` with `getSchoolStats`, `getDivisionStats`, `getClassStats`. Admin `/admin/reports` shows school-wide totals, gender breakdown, per-division population, lesson-plan funnel, exam status, today's attendance. Deputy Head `/deputy-head/reports` is the same shape filtered to one division (7-day attendance, lesson-plan funnel, class ranking by aggregate). Teacher `/teacher/reports` aggregates each class the teacher teaches/class-teaches with attendance + subject averages from published exams. |
| **7b — PSC Report** | 0.5 week | ✅ Admin-only printable Population & Staff Census at `/admin/reports/psc` — totals, per-class boy/girl breakdown with division subtotals, school total row, and teachers grouped per division. Reuses the existing report-card print mode (A4, scoped via `body.print-mode-report-card`). |
| **7c — Academic Calendar** | 0.5 week | ✅ New `calendar_events` table (title, description, startDate, endDate?, type: term_start \| term_end \| exam \| holiday \| event, createdById). Admin manages at `/admin/calendar` (add + delete). Read-only `/<role>/calendar` views for Deputy Head, Teacher, Parent showing Upcoming + Past sections. |
| **5.7 — Student Promotion** | 1 week | ✅ End-of-year promotion workflow (originally deferred from MVP build). Three new tables: `promotion_seasons` (school × year gate), `promotion_submissions` (one per class × year), `promotion_decisions` (per student). Admin `/admin/promotions` opens/closes the season; opening when Term-3 EndOfTerm isn't published surfaces an AlertDialog and records `openedWithOverride=true`. Class Teacher `/teacher/promotions/[classId]` lists the roster with a `computePromotionSuggestion` chip (fails 3+ core subjects on Term-3 → Repeat; JHS 3 → Graduate; otherwise Promote), Save Draft + Submit. Per-student decision = Promote / Repeat / Withdraw (Graduate / Repeat for JHS 3), target class auto-picked same-suffix (`autoPickTargetClass` in `lib/next-class-resolver`), reason required for Repeat/Withdraw. Deputy Head `/deputy-head/promotions` queue + per-class Approve / Send back with required comment. After DB cutover, approval runs a real transaction that closes current-year enrollments, inserts new-year `enrollments` (Active for Promote, Repeating for Repeat), flips `students.isActive=false` for Withdraw, and writes one `PROMOTION_APPROVED` audit log row. |
| **DB Cutover** | 1 week | ✅ Removed `USE_MOCK_DATA` flag and the entire `src/lib/mock/` directory. Every action and query now reads/writes through Drizzle ORM. `src/db/index.ts` branches on `DB_DRIVER` env var (or auto-detects from `*.neon.tech` host) — `pg` for local Docker + Railway, `neon-http` for Neon prod. Schema converted from uuid PKs to varchar so the human-readable mock IDs (`STAFF-001`, `class-jhs1a`) port 1:1 through the seed. Generated baseline migration at `drizzle/0000_init.sql`, applied via `scripts/migrate.ts` (`npm run db:migrate`). New `scripts/seed-db.ts` ports every fixture from `scripts/_seed-data/` into the DB — flags `--reset` / `--idempotent` / `--no-demo`. Audit log wired for `SCORE_OVERRIDE`, `STUDENT_EDIT`, `ROLE_CHANGE`, `PROMOTION_APPROVED` via `src/lib/audit-log.ts`. `getCurrentSchoolId()` helper routes the single-school constant through one swappable function. Two new tables added in passing — `staff_attendance_sessions` + `staff_attendance_records` — that were missing from the original schema but referenced by the staff-attendance feature. Railway `startCommand` now runs `db:migrate && db:seed:prod && next start`. Spec at `docs/superpowers/specs/2026-05-19-db-cutover-design.md`. |
| **Audit log viewer** | 0.5 week | ✅ Admin-only `/admin/audit-log` page. Filters by action + date range (default last 30 days), pagination 50/page. Expandable rows show side-by-side before/after JSON with changed-key highlighting. New feature module `src/features/audit-log/`. Sidebar entry under Admin → System. |
| **File uploads (Firebase Storage)** | 1 week | ✅ Firebase Storage emulator wired (`firebase.json` + `src/lib/firebase.ts` + `src/lib/firebase-admin.ts`, port 9199). `storage.rules` allows public read for `photos/**` and signed-URL-only for `documents/**` (server-minted 1-hour signed URLs via `getSignedDownloadUrl`). Reusable components: `ImageUploadField` (drag/click, progress, preview), `FileUploadField` (drag/click, progress), `DocumentDownloadLink` (server, signs on render), `ClientDocumentDownloadLink` (client, signs via `signDocumentUrlAction` on click). Wired into: Student + Staff register/edit + Profile (`updateMyPhotoAction`); Lesson plan / Scheme / Assignment forms. New `UserAvatar` single source of truth used in 15 spots across the app — prefers the real photo when set, falls back to gradient + initials. Header/Sidebar/Profile pull the current user's photo via `getMyPhotoUrl(linkedId)`. |
| **UX polish** | 0.5 day | ✅ UHAS brand palette is now the default — root `<html data-color-scheme="uhas">` so it applies on first paint with no flash. `useTheme().setColorScheme("default")` still removes it. "Mark all present" on both attendance sheets (student + staff) is now a single click that stages everyone present (keeping approved-leave staff on leave) and immediately saves the session — previously it just staged the change and the user had to click Save separately, which made it look broken when the default state was already "all present". |
| **8 — Testing (layers 1 + 2)** | 1 week | ✅ Vitest configured with a separate `uhas_sms_test` Postgres database. 128 tests across 10 files run in ~12 s end-to-end. Layer 1 (pure unit tests, no DB) covers all the score/grade/aggregate maths, promotion suggestion algorithm, next-class resolver, and academic-year helper. Layer 2 (integration tests against a real seeded test DB) covers the six most dangerous / transactional flows: auth (login flow + role-based redirects + mustChangePassword + change-password), students (create with sequence-ID generation + transfer + audit log), scores (save + compute + position reranking + `SCORE_OVERRIDE` audit on override), promotions (the full approval transaction: closes current-year enrollments + opens new-year ones with `Active`/`Repeating` statuses + flips `students.isActive=false` for Withdraw + writes `PROMOTION_APPROVED` audit log), attendance (save + leave-request lifecycle), and the audit-log helper + viewer queries. The test pass caught a real bug — `saveScoresAction` was looking up existing rows by a constructed ID that never matched seeded IDs, causing every re-save against seeded scores to double-insert silently — now fixed to look up by `(examId, subjectId, studentId)` tuple. Tooling: `tests/setup.ts` mocks `next/headers`, `next/cache`, and `firebase-admin/{auth,app,storage}`; `tests/db.ts` truncates + reseeds per file using the same `scripts/seed-db.ts` that runs in dev. Run with `npm run db:test:setup` (once) then `npm test`. |
| **CI workflow** | 0.5 day | ✅ `.github/workflows/ci.yml` runs on pushes + PRs to `main`/`develop`. Spins up a Postgres 16 service container, runs `db:test:setup` to create the test DB + apply migrations, then `lint → tsc → npm test → npm run build` in sequence. The job's env block provides dummy Firebase placeholders so `next build` succeeds without leaking secrets — production gets real values from Railway's env. Total CI run time: ~2-3 minutes. |
| **8 — Testing (layer 3)** | ✅ | Playwright E2E only (RTL component layer skipped — covered indirectly by E2E). 7 tests across 5 specs run against a production-built Next server on port 3100 with the Firebase Auth Emulator on 9099 and a separate `uhas_sms_e2e` database. Specs: admin-students (register a student via the UI → list filter shows it), teacher-attendance ("Mark all present" bulk save → success toast), lesson-plan-flow (Unit Head approves a submitted plan → Deputy Head approves a unit-head-approved plan), promotion-flow (admin opens season → teacher sees their classes), parent-report-card (parent opens a published Mid-Term report from the results list). Playwright `globalSetup` resets the DB, seeds the Auth Emulator, and logs in each role via the real login form, saving cookies as `storageState` per role so specs start authenticated and run in seconds. Two production bugs surfaced during this layer and were fixed: Base UI `SelectTrigger` was missing `type="button"`, so clicking a Select inside any form silently fired a form submit; shadcn `Input` wrapped `@base-ui/react/input` (Base UI's Field.Control) without a Base UI `<Field>` context, causing inputs to remount on every render and wipe their value. CI runs E2E as a separate job, only on push to `main` — heavy because it needs Java + the Auth Emulator + a full Next build. Scripts: `npm run db:e2e:setup`, `npm run e2e:build`, `npm run e2e`. |
| **Total** | ~17 weeks | Launchable MVP + test coverage |

### Phase 8 — Testing (when mock data is replaced with real DB)

Tests are written **per feature, as each module's mock data is swapped out for real DB integration.** Do not write tests while a feature still uses mock fixtures — the tests would be testing fake data, not real behaviour.

**Stack**
- **Unit / integration:** Vitest + React Testing Library
- **E2E:** Playwright

**What to test per feature (when real DB is wired):**

| Feature | Test focus |
|---|---|
| Auth | Login flow, role-based redirect, session expiry, first-password-change enforcement |
| Students | Registration validation, auto-ID generation, soft-delete, class transfer |
| Staff | Registration, role assignment, welcome email trigger |
| Attendance | Mark present/absent/late, same-day-only edit rule, Admin past-date override |
| Exams & Scores | Score entry, `computeGrade()` logic for all GES bands, locked-after-publish rule, Admin override audit log |
| Lesson Plans | Status transitions (draft → submitted → approved/rejected), approval chain per division |
| Announcements | Audience targeting (all / division / class), critical flag triggers email |
| Reports | Correct aggregations (attendance %, pass/fail rates), PDF export output |
| Middleware | Each role is redirected to correct dashboard; cross-role access blocked |

**Test data:** Use the existing `src/lib/mock/` fixtures as seed input for integration tests — they are the canonical representative data set.

**Coverage target:** All Server Actions and query functions must have integration tests. UI components need tests only for non-trivial conditional logic (e.g. approval workflow state machine, grade display based on score).

---

## 8. Key Constraints & Decisions

- **No offline support needed** — school has stable internet connection
- **Web-first** — teachers use personal smartphones/laptops; mobile web must work at 375px+
- **English primary language** — Ewe teachers can write lesson content in Ewe (no UI translation needed)
- **Student ID format** — configurable by Admin at school setup, immutable once generated
- **Report card templates** — KG format TBD (school to provide template); Primary + JHS to use standard GES layout
- **Results publishing** — Head of School reviews → Admin publishes (Deputy Heads cannot publish)
- **Timetable** — deferred to Phase 2
- **Payroll, medical, counselling** — explicitly out of MVP scope. Fee management was out of the original MVP but is now underway — see `v2/UHAS_Migration_Execution_Plan.md` §9 (Phase 5) and the README's Development Phases table.

---

## Next up — Profile page completion

The `Profile & Settings` page at `/admin/profile`, `/deputy-head/profile`, `/teacher/profile`, `/parent/profile` is shared via [`src/features/profile/components/ProfilePage.tsx`](../src/features/profile/components/ProfilePage.tsx). Most of it is wired UI on top of mocked behavior. Pick this up next and implement everything in this section for real — no more placeholder toasts.

### Audit (today's state)

**Works for real:**
- Avatar / name / email / role readout (live session data)
- **Photo upload** — staff only (Admin / DH / Teacher). `updateMyPhotoAction` → `staff.photoUrl` + revalidate. Pipeline is correct; parents are excluded.
- **Change password** — Firebase `reauthenticateWithCredential` + `updatePassword`.

**Mocked / non-functional (this is the work):**

| Tab | Item | What's there now | What needs to happen |
|---|---|---|---|
| Profile | "Save Changes" button | `onSubmit` sleeps 600ms then toasts success; persists nothing | New `updateMyProfileAction`. Persist `phone` on `staff` (existing column) and on a new column for parents. `displayName` syncs to `users.email`-resolved row + Firebase `updateProfile`. `language` persists on a new column (see prefs below). |
| Profile | Parent photo upload | Disabled by `linkedId.startsWith("STAFF-")` gate; `guardians` has no `photo_url` column | Add `photo_url` column to `guardians`, generate migration, extend `updateMyPhotoAction` to branch on linkedId prefix (STAFF / guardian), reuse the same Storage path scheme (`photos/guardians/<id>.<ext>`), update `getMyPhotoUrl` to query the right table. |
| Profile | Language preference | Local state only | Persist on a per-user preferences table (see below) and read on session hydration so the UI can switch language once i18n is in. Until i18n lands, the value is still worth storing so the toggle stops being a no-op. |
| Security | 2FA / TOTP | Placeholder QR div, hardcoded backup codes, "Firebase TOTP setup coming soon" | Wire Firebase MFA: `multiFactor(user).getSession()` + `TotpMultiFactorGenerator.generateSecret()` → QR via `qrcode` (already in deps) → `enroll()`. Backup codes from Firebase response, persisted server-side per user with `bcrypt` hashing. UI flow stays the same; just real plumbing. |
| Security | Active Sessions | Hardcoded `MOCK_SESSIONS` array (MacBook, iPhone, Windows) | Real sessions list from a new `auth_sessions` table written on login (`{userId, userAgent, ip, createdAt, lastSeenAt, current}`). Login action inserts a row; logout / revoke deletes one. Revoke kicks the listed cookie's `session_uid` into a deny list (or rotates a session epoch on `users`). "Current" detection by matching the request's session cookie. |
| Notifications | All three toggles | Local state + toast "Preference saved." Never persisted. | New `user_preferences` table (`userId`, `notif_email_announcements`, `notif_email_attendance`, `notif_in_app_sound`, `language`). Server action upserts on change. Wire reads on the email-send paths (`src/lib/email.ts` caller-side checks the prefs row before sending). |
| Danger Zone | Deactivate | Local-confirm dialog → toast "Deactivation request sent to administrator." No request actually sent. | New `account_deactivation_requests` table or reuse `audit_log`. Server action writes a row + sends an email to all Admins via the existing `src/lib/email.ts` so a human can act on it. Admin gets a list view at `/admin/deactivation-requests` (or surfaced in the audit log viewer) to approve / reject. On approve → set `users.isActive = false` + write `audit_log`. |

### Suggested execution order

1. **Stop lying first** — fix the Profile-tab Save button (`displayName`, `phone`). One server action, two columns. ~1 hr.
2. **Parent photo upload** — schema migration + action branch. ~1 hr.
3. **User preferences table + notifications wiring** — single migration, two server actions (`getPrefs`, `updatePrefs`), wire reads into `src/lib/email.ts` callers so toggles actually gate email sends. ~2 hr.
4. **Account deactivation request flow** — migration + action + admin view + email-on-create. ~2 hr.
5. **Real active sessions** — new table + login/logout action wiring + revoke endpoint. ~3 hr (touches `loginAction` and `logoutAction`).
6. **Firebase MFA / TOTP** — wire `multiFactor()` API + QR + backup codes. The most isolated piece. ~3 hr.

Total ~12 hr if done well. Don't bundle everything into one PR — each row above is one PR.

### Definition of done

- No `toast.success(...)` in the Profile page is fired without a real persisted write.
- Refreshing any tab shows the saved state, not the original.
- Parents can do everything staff can (where it makes sense — they don't get the Staff-ID badge, but they get photo upload, name/phone edit, password change, notification prefs, deactivation request).
- The Admin who would receive a deactivation request actually receives one (via email and in-app list).
- E2E spec added for: edit name → reload → name persists; toggle a notif → trigger an action that would send mail → mail is suppressed when the toggle is off.

---

## Next up — Admin Settings page

There's no `/admin/settings` route today. School-wide configuration is split between:

- **Hardcoded constants** — `DEFAULT_SCHOOL_ID = "school-uhas-001"` in [`src/lib/school.ts`](../src/lib/school.ts), `DEFAULT_ACADEMIC_YEAR = "2025/2026"` in [`src/lib/academic-year.ts`](../src/lib/academic-year.ts), GES grading bands in [`src/features/exams/utils.ts`](../src/features/exams/utils.ts), an 8-hour `MAX_AGE_SEC` for sessions in [`loginAction`](../src/features/auth/actions/login.ts), and a `"60% exam + 4×10% components"` weighting marked "Placeholder" in the same exams utils.
- **`schools` table** that already has `name`, `academicYear`, `currentTerm`, `gradingScale` columns but no UI reads or writes them.
- **Env vars** for Firebase / SMTP / `APP_URL`.

The settings page surfaces what should be school-configurable to an admin UI, persists in the existing `schools` row, and stops the hardcoded constants from being the source of truth where it doesn't make sense.

### Scope — what's in / what's out

**In scope (MVP — ~10–12 hours, ship in 3–4 PRs):**

1. **School identity** (~2 h)
   - Fields: school name, motto/tagline (new), address, phone, email, principal name (new).
   - Backed by `schools` table — add `motto`, `address`, `phone`, `email`, `principal_name` columns via migration. `name` already exists.
   - Logo upload via existing `ImageUploadField` → Firebase Storage `photos/school/logo.<ext>`. Read everywhere the static `/logo.png` is used today (login page, sidebar, header, report cards).
   - Surfaces today's hardcoded school ID — admin sees it read-only.

2. **Academic calendar** (~3 h)
   - Active academic year (`schools.academicYear` — already exists).
   - Three term date ranges (new `school_terms` table: `{schoolId, year, term, startDate, endDate}`). Drives the report-card header dates + the "current term" detection in dashboards.
   - "Current term" (`schools.currentTerm` — already exists; manual override + auto-pick based on today's date vs term ranges).
   - Admin can roll over to a new academic year here (button creates the next year's class records via the existing Promotion flow).

3. **Grading + scoring config** (~2 h)
   - Grading scale dropdown: `GES_STANDARD` (current default) vs `CUSTOM`. When `CUSTOM`, expose the 9 bands as editable rows (`min`, `max`, `grade`, `interpretation`).
   - Score component weights (CAT 1, CAT 2, Group Work, Project Work, end-of-term). Today's "Placeholder: 60% + 4×10%" stops being a placeholder.
   - Pass mark threshold for "core subjects" used by the promotion auto-suggest. Today this is implicit; expose it.
   - Persist on `schools` as JSON columns (`grading_bands`, `score_weights`, `pass_mark`). [`computeGrade`](../src/features/exams/utils.ts) + [`computeTotalScore`](../src/features/exams/utils.ts) read from the row instead of constants.

4. **Communication defaults** (~1 h)
   - From-name for outbound emails (default `"UHAS SMS"`). Currently read from `EMAIL_FROM` env var — surface that as a fallback and let admin override on the row.
   - Reply-to address (new field on `schools`).
   - Per-event notification toggles (per-school default — overridden by individual user prefs once those are wired in the Profile completion spec):
     - "Send email when lesson plan is rejected" — currently always on
     - "Send email on new announcement" — not wired yet
     - "Send email when results are published" — not wired yet
   - Backed by a `schools.notification_defaults` JSON column.

5. **Security policy** (~2 h)
   - Session timeout (currently 8 h hardcoded). Move to `schools.session_timeout_minutes` with a min/max validator (15 min – 24 h). `loginAction` reads it.
   - Minimum password length (currently 8 in [`change-password`](../src/features/auth/actions/change-password.ts) action). Move to `schools.password_min_length`.
   - "Force password change on first login" toggle (today `mustChangePassword` is hardcoded `true` on user creation — admin can flip this).

6. **Branding** (~1 h)
   - Default color scheme: UHAS brand vs default. Already controllable per-user; this sets the school-wide default for new sessions. Backed by `schools.default_color_scheme`.
   - Sidebar accent color override (optional — single hex input that maps to `--accent-orange`).

**Deferred / out of MVP:**

- **Per-event email recipient lists** (e.g. "CC the head on every lesson plan rejection") — overkill until volume justifies.
- **SMS gateway settings** — phase 6c-equivalent for SMS, no SMS sender wired yet.
- **2FA enforcement policies** — depends on the Profile completion 2FA wiring landing first.
- **Audit log retention** — log table is unbounded today; revisit when it gets large.
- **Integrations exposure** (Firebase config, Storage paths) — env-managed, admin shouldn't touch.
- **Data export / backup** — Railway / Neon handle this at the infra layer.
- **Multi-school tenancy admin** — covered by the existing "Multi-school tenancy" item in Potential future improvements.

### Architecture sketch

- New route: `/admin/settings/page.tsx`. Tabs match the six sections above (`Identity / Calendar / Grading / Communication / Security / Branding`), same `Tabs` + `motion` pattern the Profile page uses.
- New feature module: `src/features/settings/`:
  ```
  src/features/settings/
  ├── actions/
  │   ├── update-school.ts        # one action per tab to keep PRs small
  │   ├── update-calendar.ts
  │   ├── update-grading.ts
  │   ├── update-communication.ts
  │   ├── update-security.ts
  │   └── update-branding.ts
  ├── queries/
  │   └── get-school-settings.ts  # one query returning the whole row
  ├── components/
  │   ├── SettingsPage.tsx        # tab shell, reads the query
  │   ├── IdentityTab.tsx
  │   ├── CalendarTab.tsx
  │   ├── GradingTab.tsx
  │   ├── CommunicationTab.tsx
  │   ├── SecurityTab.tsx
  │   └── BrandingTab.tsx
  └── types.ts
  ```
- All writes hit the existing `schools` row (id = `school-uhas-001` for now via `getCurrentSchoolId()`). Every action writes an `audit_log` row with `action: "SCHOOL_SETTINGS_UPDATE"`, `before`/`after` JSON — critical for any school's compliance posture.
- Read path: `getCurrentAcademicYear()`, `computeGrade()`, `loginAction`'s `MAX_AGE_SEC`, etc., all switch from importing constants to reading from a cached `getSchoolSettings()` query. Cache via Next's `unstable_cache` keyed on schoolId; invalidate via `revalidateTag("school-settings")` from every settings action.

### Schema migration (one-time)

Single migration adds the new columns to `schools` + creates `school_terms`:

```sql
ALTER TABLE schools
  ADD COLUMN motto VARCHAR(255),
  ADD COLUMN address TEXT,
  ADD COLUMN phone VARCHAR(50),
  ADD COLUMN email VARCHAR(255),
  ADD COLUMN principal_name VARCHAR(255),
  ADD COLUMN logo_url VARCHAR(500),
  ADD COLUMN grading_bands JSONB,
  ADD COLUMN score_weights JSONB,
  ADD COLUMN pass_mark INTEGER DEFAULT 40,
  ADD COLUMN notification_defaults JSONB,
  ADD COLUMN session_timeout_minutes INTEGER DEFAULT 480,
  ADD COLUMN password_min_length INTEGER DEFAULT 8,
  ADD COLUMN default_color_scheme VARCHAR(20) DEFAULT 'uhas',
  ADD COLUMN sidebar_accent_hex VARCHAR(7);

CREATE TABLE school_terms (
  id VARCHAR(64) PRIMARY KEY,
  school_id VARCHAR(64) NOT NULL REFERENCES schools(id),
  academic_year VARCHAR(9) NOT NULL,
  term INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  UNIQUE (school_id, academic_year, term)
);
```

Seed (`scripts/seed-db.ts`) updates one row with the current placeholder values so existing flows keep working.

### Suggested PR order

1. **Migration + read-only Identity tab** (~2 h) — biggest unblocker. Writes the schema, surfaces the school in the UI, swaps the static `/logo.png` references to the DB-driven logo URL. Two server actions: read, update (covers the Identity tab fields).
2. **Calendar tab + `school_terms` migration** (~3 h) — adds the terms table, the date-range editor, and the "current term" auto-pick.
3. **Grading + Security tabs** (~3 h) — both are constants-to-DB-column moves with minimal UI. Bundles cleanly because they share the same risk profile (touching read-paths in `computeGrade` + `loginAction`).
4. **Communication + Branding tabs** (~2 h) — last + lightest. Communication wires into the email module's call sites (add a check against `notification_defaults` before sending).
5. **E2E spec** (~1 h) — Admin changes school name → reloads → header shows the new name. Toggles "email on lesson-plan rejection" off → Unit Head rejects a plan → no email sent (assert via the email module's dev-mode log mode).

Total: **~11 hours**, 5 PRs. None of them touch the same files as the Profile completion work, so the two can be picked up in parallel.

### Definition of done

- `DEFAULT_SCHOOL_ID` is the only remaining hardcoded constant in `src/lib/school.ts` (and it's used only by `getCurrentSchoolId()` until tenancy lands).
- `getCurrentAcademicYear()` reads from `schools.academicYear`, not `DEFAULT_ACADEMIC_YEAR`.
- `computeGrade()` and `computeTotalScore()` read bands + weights from the school row, with the env-default kicking in only if the row's columns are null.
- Login session length is whatever the admin sets in Security tab.
- Every setting write produces an `audit_log` row with the field-level before/after.
- Settings page is admin-only (proxy already enforces `/admin/*` for Admin role; double-check in this PR).

---

## Next up — Commercial roadmap (drives sales-readiness)

Sequencing comes from [docs/COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md), which benchmarks us against SchoolPad, iSchool, TopHat, ClassEra, and others on the Ghana / West Africa basic-school market. Full reasoning, effort breakdown, and revenue impact are in that doc; this section is the engineering-side punch list.

### Track 1 (next 2 months) — close the critical sales-blocking gaps

Without these two, every conversation against SchoolPad ends with "but does it handle fees?" / "but does it text parents?".

#### 1. **Fee management** — ~40–60 h, single PR

> Superseded by the actual build: see `v2/UHAS_Migration_Execution_Plan.md` §9 (Phase 5) and the README's Development Phases table. Tracking core (fee items, learner assignment, Accountant-recorded payments) is done; the Paystack/pay-now plan below was evaluated and explicitly declined — parents pay at the school, not through the app — so that part won't be built.

- Fee structures table: `fee_structures (id, school_id, class_id, term, year, item, amount)`
- Per-student-per-term invoice generation (`fee_invoices` + `fee_invoice_lines`)
- Pay-now → **Paystack** hosted checkout (Ghana MoMo + card + bank transfer)
- Webhook receiver flips invoice status, audit-log entry on every state change
- Parent view: "what I owe + pay now" on the parent dashboard
- Admin view: collection rate, outstanding by class, overdue list
- Receipts: server-rendered PDFs, emailed via existing `src/lib/email.ts`
- Bursaries / scholarships / sibling discounts as percentage-off adjustments on the invoice level
- Unblocks: justifies subscription bump from €3,000 → ~€3,800–4,200/year

#### 2. **SMS gateway** — ~10–15 h, single PR

> Superseded by the actual build: `apps/api/app/features/sms/` (Hubtel chosen, `SmsProvider` interface, `sms_log` table, Inngest fan-out job) exists since Phase 3, with a stub provider — a real `HubtelSmsProvider` + fee-reminder trigger is Phase 5 Slice 3.

- Provider plug: **mNotify** (Ghana-local, MoMo top-ups) or **Hubtel** (broader)
- `src/lib/sms.ts` mirroring the `src/lib/email.ts` pattern (provider-agnostic, env-gated, logs in dev)
- Trigger SMS for: absence today, fee reminder, results published, urgent announcement
- Per-school SMS credit pool stored on `schools.sms_credits`, topped up via Paystack
- Falls back from in-app notification when user hasn't opened the app in N days (configurable)
- Admin dashboard: SMS usage chart, balance, top-up button
- Unblocks: communication reaches 100% of parents, not just app users

### Track 2 (months 2–4) — kill the remaining objections + unblock scale

#### 3. **Timetable management** — ~30–40 h
- Schema: `periods (period_number, start_time, end_time)`, `timetable_slots (class_id, period, day_of_week, subject_id, teacher_staff_id, room)`
- Conflict detection: teacher can't be in two rooms, room can't host two classes
- Per-teacher view ("my week"), per-class view ("our timetable")
- Substitute overrides when a class teacher is on approved leave
- Print-friendly layouts
- Removes a sales objection ("does it have a timetable?")

#### 4. **Multi-tenancy refactor** — ~80 h, multi-PR
- Replace `getCurrentSchoolId()` constant with per-session resolution from `users.schoolId`
- Tenant-aware Firebase setup decision: single project + `schoolId` custom claim filtering, or one Firebase project per tenant. **Decision call** before starting.
- Storage path scoping: `photos/<schoolId>/staff/<id>.jpg`, `documents/<schoolId>/lesson-plans/...`
- Storage rules updated to read `schoolId` from auth token claims
- Admin-of-admins UI for adding new schools (only you / your business have this role)
- Tenant isolation tests in Vitest
- **Hard prerequisite for school #2** — without this, every new tenant is a fresh stack at ~3 hours of setup + recurring infra cost

### Track 3 (months 4–6) — differentiation + Ghana-specific value

#### 5. **Mobile PWA** — ~30–50 h
- `public/manifest.json` with proper icons + install banner
- Service worker with stale-while-revalidate for already-fetched routes
- Offline reads for: attendance roster, lesson plans, recent results
- Web Push subscription flow (Android only initially; iOS push is limited)
- Differentiates vs SchoolPad's "must be online to do anything"

#### 6. **WhatsApp Business API** — ~20–30 h
- Connect via **Meta Cloud API** or **Twilio**
- Mirror SMS triggers; deliver via WhatsApp where the parent has opted in
- Two-way replies: parents text structured queries ("FEE 2025-0021" → fee balance reply)
- Bulk messaging UI for defined audiences (all JHS 3 parents, etc.)
- Replaces the school's ad-hoc WhatsApp group with structured comms; unique Ghana-market value

### Track 4 (post-product-market-fit) — opportunistic

#### 7. **AI-assisted features** — ~25–35 h
- "Generate this week's lesson plan from my scheme of work" → LLM call → editable draft
- "Suggest personalized comments for each student" → consume term scores + attendance + lesson record → 30 draft comments
- Teacher always reviews / edits before save — never auto-published
- Use Anthropic API (Claude Haiku for cost) or OpenAI 4o-mini
- Premium-tier feature, +€500–1,000/year on subscription

#### 8. **Online admissions** — ~25–35 h
- Public application form (no login)
- Document uploads via Firebase Storage signed URL
- Application tracking dashboard for admin
- Entrance exam scheduling
- Acceptance / rejection email workflow
- Auto-create student record on acceptance

#### 9. **Library / inventory** — ~30–40 h
- Book catalog + barcode lookup
- Checkout / return flow per student
- Asset register for non-book items (computers, projectors)
- Maintenance / repair tracking

#### 10. **Parent-teacher chat** — ~25–40 h
- Threads per student, opt-in
- Teacher availability hours respected
- Admin oversight: all chats logged + auditable
- Notifications via in-app + SMS + WhatsApp (depends on those modules)

### Track 5 — deferred indefinitely (don't build unless a customer asks)

- HR / payroll, hostel, transport, cafeteria, video class, online CBT, alumni management.

### Validations before betting heavily on the roadmap

1. **UHAS willingness to pay** for fees + SMS as an add-on — would they pay €1,000+ for the upgrade? If yes, the modules pay for their own engineering. If no, treat UHAS as a free beta on those modules in exchange for case-study rights.
2. **Sales pipeline existence** — is there a real path to school #2 and #3? Without that, multi-tenancy is premature.
3. **Paystack / Hubtel / mNotify accounts** — verify they can be opened from Europe; most require a Ghana-resident director + Ghana phone number. Workaround: partner with a Ghana-based operator who fronts the merchant account.
4. **WhatsApp Business API approval** — Meta has tightened verification. Verify eligibility before committing engineering.
5. **Multi-tenancy effort** — spec it in detail before starting; the Firebase claim model is a non-trivial design call.

---

## ✅ Done — Drop JHS class streams

The school runs **one class per level** — no parallel streams. The current seed has JHS classes named with a stream suffix (`JHS 1A`, `JHS 2A`, `JHS 3A`) and IDs like `class-jhs1a`. Drop the `A` everywhere; keep "Primary 1-6" + "JHS 1/2/3" as the canonical names. KG 1 / KG 2 already match.

Do this *before* seeding production. After `db:seed:prod` runs, the class IDs become load-bearing across audit logs, foreign keys, URLs, and any GitHub-hosted attachments. Renaming becomes a data migration instead of a seed change.

### Target naming

| Division | Class names | Class IDs |
|---|---|---|
| KG | KG 1, KG 2 | `class-kg1`, `class-kg2` (unchanged) |
| Lower Primary | Primary 1, Primary 2, Primary 3 | `class-p1`, `class-p2`, `class-p3` (unchanged) |
| Upper Primary | Primary 4, Primary 5, Primary 6 | `class-p4`, `class-p5`, `class-p6` (unchanged) |
| JHS | JHS 1, JHS 2, JHS 3 | `class-jhs1`, `class-jhs2`, `class-jhs3` (drop the `a`) |

So only the three JHS rows actually change.

### Files to touch

**Production code (3 small edits):**

| File | Change |
|---|---|
| [src/features/classes/components/ClassCreateForm.tsx](../src/features/classes/components/ClassCreateForm.tsx) | Preset list rows: `"JHS 1A"` → `"JHS 1"`, `"JHS 2A"` → `"JHS 2"`, `"JHS 3A"` → `"JHS 3"` |
| [src/features/promotions/lib/next-class-resolver.ts](../src/features/promotions/lib/next-class-resolver.ts) | `SEQUENCE` array stays as-is (already uses `"JHS 1"`/`"JHS 2"`/`"JHS 3"`). The `stripSuffix` regex (`/\s*[A-Z]$/`) is dead code once streams are gone — remove it and `streamSuffix` along with it. `autoPickTargetClass` collapses to "filter by name match, return the single candidate". |
| [src/features/schemes/components/SchemeForm.tsx](../src/features/schemes/components/SchemeForm.tsx) | Placeholder text `"e.g. JHS 1A — English Scheme of Work, Term 1"` → `"e.g. JHS 1 — English Scheme of Work, Term 1"` |

The `cls.name.startsWith("JHS 3")` graduate checks in promotions actions + decision table already work since `"JHS 3"` starts with `"JHS 3"`. Tighten them to `cls.name === "JHS 3"` for clarity but it's not required.

**Seed data (find/replace across 8 files):**

```
class-jhs1a    → class-jhs1
class-jhs2a    → class-jhs2
class-jhs3a    → class-jhs3
class-jhs1a-2027 → class-jhs1-2027
class-jhs2a-2027 → class-jhs2-2027
class-jhs3a-2027 → class-jhs3-2027
"JHS 1A"       → "JHS 1"
"JHS 2A"       → "JHS 2"
"JHS 3A"       → "JHS 3"
```

Files: `scripts/_seed-data/classes.ts`, `students.ts`, `class-subjects.ts`, `attendance.ts`, `schemes.ts`, `lesson-plans.ts`, `assignments.ts`, plus check `exams.ts` and `scores.ts`.

**Tests:** same find/replace pattern in `tests/integration/{promotions,attendance,scores,students}.test.ts` and `tests/e2e/specs/02-teacher-attendance.spec.ts`.

### Estimate

~45 min total — mostly mechanical find/replace + one run of `npm test && npm run e2e:build && npm run e2e` to confirm green.

### Why defer instead of doing now

User preference at the time. Listed here so it's picked up before the first production seed, not after.

---

## Potential future improvements

Captured during scoping discussions. None of these are committed; they're a parking lot for "when X becomes a problem, here's the path we already thought through." Roughly ordered cheapest → most expensive.

### Mobile / companion app

The web is already mobile-friendly. The cheap path is a **PWA** (manifest + service worker + install prompt + web push). The full path is a native companion. Either way, parents are the target audience — admin / teacher flows stay web.

| Step | What | When |
|---|---|---|
| **PWA wrapper** | Add `public/manifest.json`, a service worker, and the web-push subscription flow. Reuses the entire existing site. | First. Cheap (~1–2 wk). Solves install + Android push immediately; iOS push is improving. |
| **Refactor `actions/` → `services/`** | Move the business logic out of Server Actions into plain functions under `src/features/*/services/`. Actions become thin adapters. Unlocks reuse for any non-web caller. | Before any mobile work. Cheap on its own; refuses to be cheap later. |
| **JSON API surface** | Add `app/api/*` route handlers that call the same services and authenticate via Firebase ID token (`Authorization: Bearer`), not the httpOnly session cookies. | When the first non-web client lands. |
| **Capacitor shell** | Wrap the existing site in a native shell for App Store / Play Store presence and reliable push via FCM. One codebase. | If PWA limits hurt — typically iOS push reliability or store-discoverability. |
| **React Native / Expo app** | Separate parent-only app with biometric login, real offline cache, deep native UX. | Only if Capacitor stops scaling — usually because of complex offline sync or custom native features. Two codebases from this point. |
| **Firebase Cloud Messaging** | Server-side push via `firebase-admin/messaging`. Triggers: absence marked, result published, lesson plan rejected, announcement posted, appointment booked. Mobile clients register their FCM token on the `users` row. | Pairs with PWA push, then carries straight into native. |
| **Offline cache** | Schools in Ghana hit spotty connectivity. Minimum: cache the last fetched view so the screen isn't blank offline. Full: local SQLite with sync. | When users complain. Don't pre-build. |

**Minimum mobile scope when it ships** (parents-only): login (biometric optional) → "My children" → today's attendance + this week → latest announcements → published report cards (re-uses the print view in a WebView) → assignments due → push notifications.

### Transactional email upgrade

`src/lib/email.ts` is provider-agnostic but currently wired to Gmail SMTP. Swap the transport when any of these become true:

- Bulk sends become routine (Gmail caps at ~500/day personal, ~2,000/day Workspace).
- You need bounce / open / click analytics.
- The school wants emails to come from `@uhas.edu.gh` without DKIM/SPF wrangling on Gmail's "Send mail as".

**Recommended swap**: Resend (lowest friction, generous free tier, similar API). One change inside `getTransporter()` in [`src/lib/email.ts`](../src/lib/email.ts) — callers don't move.

### Multi-school tenancy

Every query already filters by `schoolId` (via `getCurrentSchoolId()`), but the helper returns a fixed constant. Opening up tenancy requires:

- Per-request `schoolId` resolution (from the session, not a constant)
- Tenant-aware admin tools (assign users to schools, switch context)
- Tenant isolation in Firebase (one project? one project per school? probably one project + custom claims for `schoolId`)
- Storage path scoping (`photos/<schoolId>/students/<id>.jpg`)
- Audit log scoping

This is a real product decision, not a tech change. Don't pre-build.

### Test coverage gaps

- **Component layer (RTL)** — skipped in favour of E2E. Revisit if specific UI components grow complex enough to warrant unit-level testing (e.g., the report card renderer).
- **Visual regression** — Playwright supports screenshots; could add for the report card + dashboards if their layout becomes load-bearing.
- **Mobile-viewport E2E** — current Playwright runs Desktop Chrome only. A `mobile-chrome` project would catch mobile-specific regressions.

### Out-of-MVP-scope (won't build unless explicitly requested)

- Timetable management
- Payroll, medical records, counselling notes
- Public-facing school website / admissions portal

Fee management and the SMS gateway were originally listed here as out-of-scope; both are now underway/built — see `v2/UHAS_Migration_Execution_Plan.md` §9 (Phase 5) and the README's Development Phases table.

---

*Last updated: 2026-05-20 — `feat/deffered-tasks` branch now holds: full DB cutover (Drizzle everywhere, `src/lib/mock/` gone, `USE_MOCK_DATA` removed), Student Promotion (5.7), audit log viewer at `/admin/audit-log`, real Firebase Storage uploads for photos + documents with `UserAvatar` everywhere, Phase 1 auth completion (reset-password email + session expiry warning modal), UHAS brand as the default colour scheme, one-click "Mark all present" on both attendance sheets, Vitest layers 1 + 2 (128 tests, ~12 s), Playwright layer 3 (7 cross-role golden-path specs against a prod-built Next server + Firebase Auth Emulator + `uhas_sms_e2e` DB), and a GitHub Actions CI workflow that runs lint + tsc + tests + build on every PR/push and the heavier E2E job only on push to `main`. Outbound email is now minimally wired via Gmail SMTP through a swappable `src/lib/email.ts`, with the lesson-plan rejection flow as the first consumer. Still deferred: higher-volume / branded transactional provider (Resend / SendGrid — swap when bulk sends or analytics are needed), KG-specific report card variant (4b — awaiting school template).*
