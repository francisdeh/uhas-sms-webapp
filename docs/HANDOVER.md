# UHAS SMS — Handover Brief

**Self-contained brief.** Paste this single file into a fresh Claude.ai conversation (or hand to a new collaborator) and they'll have everything they need to start working on the codebase. The companion docs in `docs/` exist for depth; they're optional, not required.

Last reviewed: 2026-05-21.

**Optional companion docs** (load only if going deep on a specific area):
- [implementation-spec.md](implementation-spec.md) — phase-by-phase history + spec docs
- [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) — full 23-rule code style
- [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) — feature gaps vs market in detail
- [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) — per-feature depth gaps + effort
- [CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) — technical-debt items
- [PRICING.md](PRICING.md) — commercial model
- [DEPLOY.md](DEPLOY.md) — production deploy checklist

---

## 1. What this software is

**UHAS SMS** is a production school-management system built for **UHAS Basic School**, a basic school (KG → JHS 3) in the Volta Region of Ghana. Live on Railway at `uhas-sms.up.railway.app`, backed by Neon Postgres and Firebase Auth + Storage.

The product is single-tenant today (one school) but architected so that multi-tenancy is a future refactor, not a rewrite. Code lives at `github.com/francisdeh/uhas-sms-webapp`.

**Scale**: ~350 students, ~50 teaching staff, 2 admins, 1 Head of School, 1 Deputy Head per division (4 divisions: KG, Lower Primary, Upper Primary, JHS), ~200–300 active parent accounts.

**Commercial model**: bespoke build with setup + annual maintenance fee. Pricing detail in [PRICING.md](PRICING.md). Roadmap to multi-tenant SaaS over the next ~12 months.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend / SSR | **Next.js 16** (App Router) | React 19, Server Components default, Server Actions for mutations |
| Styling | **Tailwind v4** | Config in `globals.css` `@theme inline`, no `tailwind.config.ts` |
| UI primitives | **shadcn/ui** + Base UI | Components in `src/components/ui/` |
| Forms | **react-hook-form + Zod** | Conventions enforced — no raw HTML inputs in features |
| Database | **PostgreSQL (Neon prod, Docker dev)** | Single `pg` driver for both; Neon over standard TCP |
| ORM | **Drizzle ORM** | Schema in `src/db/schema.ts`, relations in `src/db/relations.ts` |
| Migrations | **Drizzle migrator** | Files in `drizzle/`; `db:push` is intentionally not used |
| Auth | **Firebase Auth** (real prod; emulator dev) | Custom claims for `role` + `linkedId` on every user |
| Sessions | **httpOnly cookies set by Server Action** | Set by `loginAction`; 8-hour TTL configurable |
| Storage | **Firebase Storage** | `photos/**` public read; `documents/**` signed-URL only |
| Email | **Gmail SMTP via nodemailer** | Provider-agnostic via `src/lib/email.ts` |
| Hosting | **Railway** (app) + **Neon** (DB) | Railway deploys on `main` push after CI passes |
| CI | **GitHub Actions** | Lint + tsc + Vitest + build on PRs; E2E only on push to main |
| Tests | **Vitest** (142 tests) + **Playwright** (8 E2E) | Real Postgres for integration; Auth Emulator for E2E |

---

## 3. User roles + access model

Four primary roles. Each has its own dashboard route segment. Role-based routing is enforced in [src/proxy.ts](../src/proxy.ts) (Next 16 renamed middleware → proxy).

### `Admin` — `/admin/**`
The Head of School and the school's IT admin sit here. Full school access.

- Register / edit students and staff
- Open/close promotion seasons
- Publish exam results
- Configure school settings (identity, calendar, grading, communication, security, branding)
- Audit log viewer
- Manage user accounts + custom claims
- Create announcements (any audience)
- Approve/reject leave requests
- Override scores (with audit log)

### `DeputyHead` — `/deputy-head/**`
One per division (KG, Lower Primary, Upper Primary, JHS). Division-scoped access.

- Review lesson plans in their division (final approval after Unit Head)
- Approve leave requests for division staff
- See division attendance and academic performance
- Promote students through the promotion flow
- Cannot publish exam results (Admin-only)

### `Teacher` — `/teacher/**`
All teaching staff. Class-scoped — sees only their assigned classes.

- Mark daily class attendance ("Mark all present" bulk action)
- Submit lesson plans (sent up the approval chain)
- Submit schemes of work
- Create assignments
- Enter scores for their subjects
- View their own classes
- Submit promotion decisions for their class teacher's class
- Submit leave requests

#### `Unit Head` — *not a separate role*
A flag (`isUnitHead`) on a staff row, with `unitHeadOf` storing the division. Unit Heads log in as Teachers and see additional surfaces:
- Department view (all teachers in their division)
- Lesson plan review queue (first approval before DH)
- Can approve/reject lesson plans for their division

### `Parent` — `/parent/**`
Linked to one or more students via `student_guardians`. Sees only their own children.

- View child's attendance, results, report cards
- Read announcements addressed to them
- See assignments due
- Request appointments with teachers
- View school calendar

---

## 4. Feature inventory (what works today)

Grouped by domain. Everything below is shipped to prod and reachable from at least one role's UI.

### Identity & access
- Firebase Auth login with role-aware redirect to dashboard
- Password reset flow (Firebase-handled email)
- Force password change on first login
- Session expiry warning modal with extend button
- Admin can create/deactivate/reactivate users + assign roles + link to staff/guardian rows
- Per-user notification email gating via school-level defaults

### Students
- Register student (full form with photo upload)
- Edit, transfer between classes, deactivate
- Student detail page with academic + attendance summary
- Per-student report card view
- Parent → "My children" view (sibling linking partial)
- Student photos via Firebase Storage

### Staff
- Register staff
- Edit, deactivate
- Unit Head flag with division assignment
- Staff photos
- Staff list per division
- Class teacher assignments

### Classes & subjects
- 12 classes seeded (KG 1, KG 2, Primary 1–6, JHS 1–3)
- Subject definitions per division
- Class-subject mapping per division/year
- Class teacher assignment
- Current academic year + term as core context (configurable in Admin Settings)

### Attendance
- Daily session model per class
- Per-student status: present / absent / late (with reason)
- Bulk "Mark all present"
- Parent view of child's attendance per term
- Staff attendance (Deputy Head marks division staff)
- Session history per class

### Leave management (basic)
- Staff submit leave request (sick / maternity / personal / other)
- Overlap detection
- DH or Admin approve/reject
- *Gaps documented in [FEATURE-ENHANCEMENTS.md §1](FEATURE-ENHANCEMENTS.md) — no balance, no docs, no substitute workflow.*

### Lesson plans
- Teacher submits draft
- 3-tier review chain: Teacher → Unit Head → Deputy Head
- Rejection sends a notification + an email to the teacher
- File attachment via Firebase Storage signed URLs
- Status enum: draft / submitted / unit_head_approved / approved / rejected
- Reviewer comments visible to the teacher

### Schemes of work
- Per-term scheme upload
- Same Firebase Storage pattern as lesson plans

### Assignments
- Teacher creates per-class assignment with file
- Due date
- Parent view of child's assignments

### Examinations
- Per-term exam: Mid-Term + End-of-Term
- Score grid entry by subject + class
- Auto-compute: total score, grade (GES 9-point scale), interpretation, subject position
- Publish/unpublish toggle
- Score override with audit log entry
- Cumulative grade (planned, partial)

### Report cards
- Per-student per-term print layout
- Subjects, scores, grades, interpretations
- Term position
- Attendance summary
- *Gaps in [FEATURE-ENHANCEMENTS.md §5](FEATURE-ENHANCEMENTS.md) — no KG variant, no conduct, no batch print, no email-to-parent.*

### Promotion workflow
- Admin opens promotion season for an academic year
- Per-class promotion decisions: Promote / Repeat / Withdraw / Graduate
- Teacher submits decisions for their class
- DH approves the submission
- Approval materialises new `enrollments` rows in a transaction with audit log
- Status enum and full workflow tracked

### Announcements
- Title + body
- Audience scoping: school-wide / role / division
- Notification fan-out to recipients (in-app)
- Email gating via school notification defaults

### Appointments
- Parent requests appointment with a teacher
- Teacher reviews + accepts/declines
- Calendar visibility

### Calendar
- Events list (no grid view yet)
- Per-role visibility

### Audit log
- Every sensitive write captured (score override, student edit, role change, promotion approval, settings update)
- Filter by action + date range
- Side-by-side before/after JSON diff with key highlighting

### Notifications
- 9 event types fan out in-app notifications:
  - lesson_plan_reviewed
  - lesson_plan_submitted
  - announcement_posted
  - attendance_absent
  - results_published
  - leave_request_submitted
  - leave_request_decided
  - promotion_season_opened
  - assignment_created
- Bell dropdown with unread badge
- 60s client polling
- Mark-on-open UX

### Admin settings
- 6 tabs: Identity / Calendar / Grading / Communication / Security / Branding
- School name, motto, logo (uploaded), address, contact, principal
- Academic year + 3 term date ranges
- Grading bands + score component weights + pass mark
- Email from-name + reply-to
- Per-event notification defaults
- Session timeout (minutes), password min length, force-change-on-first-login toggle
- Default color scheme + sidebar accent hex
- Every save writes an audit_log row

### Outbound email
- Provider-agnostic `src/lib/email.ts` (nodemailer)
- Gmail SMTP wired for prod; logs to console in dev/CI
- First consumer: lesson-plan rejection email to teacher
- Toggleable via `school.notification_defaults`

### File uploads
- Firebase Storage with structured paths
- `photos/staff/*`, `photos/students/*` — public read, 5MB image-only
- `documents/lesson-plans/*`, `documents/schemes/*`, `documents/assignments/*` — signed-URL only, 20MB
- `UserAvatar` component falls back to initials gradient if no photo

### File-recoverability (soft deletes)
- `lesson_plans`, `schemes`, `assignments` have `deletedAt` columns
- Delete actions set `deletedAt` instead of removing rows
- Admin "Trash" view (`/admin/trash`) for restore + permanent delete
- 30-day TTL hint (cleanup cron not yet wired)

### Profile pages
- Each role has its own profile page at `/<role>/profile`
- Photo upload + password change are **real** (persist)
- Save Changes, 2FA, Active Sessions, Notifications prefs, Deactivate are **UI-only**
- *Gaps documented in [implementation-spec.md "Next up — Profile page completion"](implementation-spec.md#next-up--profile-page-completion).*

---

## 5. Architecture at a glance

```
src/
├── app/                          # Next.js App Router routes
│   ├── (auth)/                   # Login, reset-password, change-password
│   ├── (dashboard)/              # All role dashboards under here
│   │   ├── admin/                #   /admin/*
│   │   ├── deputy-head/          #   /deputy-head/*
│   │   ├── teacher/              #   /teacher/*
│   │   ├── parent/               #   /parent/*
│   │   └── error.tsx             #   Boundary catches errors in any dashboard route
│   ├── error.tsx                 # Boundary for auth + root errors
│   ├── global-error.tsx          # Last-resort layout-level boundary
│   └── proxy.ts                  # Role-based route guard
│
├── components/
│   └── ui/                       # shadcn-style primitives — Card, Button, Field, etc.
│
├── db/
│   ├── schema.ts                 # Single source of truth for all tables (~33 tables)
│   ├── relations.ts              # Drizzle relations (eliminates N+1)
│   ├── index.ts                  # db client (pg driver)
│   └── with-tx.ts                # Transaction helper
│
├── features/                     # One folder per domain — feature-based modules
│   ├── announcements/
│   ├── appointments/
│   ├── assignments/
│   ├── attendance/
│   ├── audit-log/
│   ├── auth/
│   ├── calendar/
│   ├── classes/
│   ├── exams/
│   ├── lesson-plans/
│   ├── notifications/            # Shipped most recently
│   ├── profile/
│   ├── promotions/
│   ├── reports/
│   ├── schemes/
│   ├── settings/
│   ├── staff/
│   ├── students/
│   ├── subjects/
│   ├── uploads/
│   └── shell/                    # Sidebar + Header
│
└── lib/
    ├── action-result.ts          # Canonical ActionResult<T> type
    ├── audit-log.ts              # writeAuditLog helper
    ├── dates.ts                  # date-fns wrappers
    ├── email.ts                  # nodemailer wrapper
    ├── firebase.ts               # Client Firebase init
    ├── firebase-admin.ts         # Server Firebase Admin init
    ├── firebase-storage.ts       # Client upload helper
    ├── storage-admin.ts          # Server-side signed URLs
    ├── school.ts                 # getCurrentSchoolId (today a constant)
    ├── academic-year-server.ts   # Server-side current year
    └── utils.ts                  # cn() + misc
```

### Feature module convention

Every feature folder is structured:

```
src/features/<name>/
├── actions/                      # Server Actions — mutations
├── queries/                      # Server-side reads
├── components/                   # Domain UI
├── lib/                          # Pure functions (testable)
└── types.ts
```

### Engineering rules of thumb

Top 10 (full list of 23 in [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md)):

1. **Server Components by default**; add `"use client"` only when the component needs interactivity, browser APIs, or hooks.
2. **Mutations = Server Actions** in `src/features/<name>/actions/`. Never use API route handlers for mutations.
3. **Every server action returns `Promise<ActionResult<T>>`** from `src/lib/action-result.ts`. Catch + return — don't throw from public actions.
4. **Every DB query filters by `schoolId`** via `getCurrentSchoolId()`. Multi-tenant safety, even though we're single-tenant today.
5. **Migrations only.** `db:push` is intentionally not used. After editing `schema.ts`: `pnpm db:generate && pnpm db:migrate`.
6. **Audit-log sensitive mutations.** Score overrides, student edits, role changes, promotion approvals, settings updates — all go through `src/lib/audit-log.ts`.
7. **Forms = react-hook-form + Zod.** No raw `<input>` / `<button>` in feature components. Use `Field`/`Input`/`Button` from `src/components/ui/`.
8. **Tailwind only.** No CSS modules, no inline styles outside the login brand panel. Conditional classes via `cn()`.
9. **shadcn primitives only** for UI. Photos and avatars use raw `<img>` (so Firebase Storage URLs render without `next/image` whitelist friction).
10. **UHAS brand palette is the default theme.** Set on `<html data-color-scheme="uhas">` at the root layout.

---

## 5b. Data model — every table in production

33 tables grouped by domain. Foreign keys shown as `→ table.column`. Soft-deletable tables flagged. Every table that owns user data has a `schoolId` column for the future multi-tenancy refactor.

> Source: `src/db/schema.ts`. Drizzle relations in `src/db/relations.ts` are defined for the frequently-joined tables (lesson plans, scores, students, classes, etc.) so queries use `db.query.X.findFirst({ with: {...} })` instead of manual joins.

### Multi-tenancy anchor

**`schools`** — the school. Single row today; multi-row when tenancy lands.
- `id` (PK, e.g. `school-uhas-001`), `name`, `academicYear`, `currentTerm`, `gradingScale`, `isActive`, `createdAt`
- **Settings columns** (admin-editable): `motto`, `address`, `phone`, `email`, `principalName`, `logoUrl`, `gradingBands` (JSONB), `scoreWeights` (JSONB), `passMark`, `emailFromName`, `emailReplyTo`, `notificationDefaults` (JSONB), `sessionTimeoutMinutes`, `passwordMinLength`, `forcePasswordChangeOnFirstLogin`, `defaultColorScheme`, `sidebarAccentHex`

**`school_terms`** — start/end dates per (school, year, term). Drives report-card headers + the current-term auto-pick.
- `id` (PK), `schoolId` → `schools.id`, `academicYear`, `term` (1/2/3), `startDate`, `endDate`
- Unique: `(schoolId, academicYear, term)`

### Auth bridge

**`users`** — bridges Firebase Auth UID → DB-side identity. Custom claims (`role`, `linkedId`) are set on the Firebase user; this table mirrors them for query-side joins.
- `id` (PK, Firebase UID like `uid-admin-001`), `schoolId`, `email` (unique), `role` (`Admin` | `DeputyHead` | `Teacher` | `Parent`), `linkedId` (FK to `staff.id` or `guardians.id`), `isActive`, `mustChangePassword`
- Index: `users_linked_id_idx`

### People

**`staff`** — every employee (admins + teachers).
- `id` (PK, e.g. `STAFF-005`), `schoolId`, `uhasId` (university staff ID), `firstName`, `lastName`, `rank`, `systemRole`, `division` (KG / Lower Primary / Upper Primary / JHS), `isUnitHead`, `unitHeadOf`, `photoUrl`, `phone`, `email`, `isActive`, `createdAt`
- Linked to `users` via `users.linkedId = staff.id`

**`students`** — every student.
- `id` (PK, e.g. `UHAS-2026-0001`), `schoolId`, `firstName`, `middleName`, `lastName`, `dob`, `gender`, `photoUrl`, `phone`, `address`, `nationality`, `religion`, `isActive`, `createdAt`
- Index: `students_school_active_idx`

**`guardians`** — parents / family contacts.
- `id` (PK), `schoolId`, `firstName`, `lastName`, `email` (unique, required), `phone`
- Linked to `users` via `users.linkedId = guardians.id` for Parent-role accounts

**`student_guardians`** — many-to-many. A student can have multiple guardians; a guardian can have multiple children.
- PK: `(studentId, guardianId)`
- `relation` (`Mother` | `Father` | `Uncle` etc.), `isPrimary`

### Academic structure

**`classes`** — one row per class per academic year (e.g. JHS 1 for 2025/2026, JHS 1 for 2026/2027).
- `id` (PK, e.g. `class-jhs1`), `schoolId`, `name`, `division`, `academicYear`
- Index: `classes_school_year_idx`

**`class_teachers`** — junction. Multiple class teachers per class supported; one flagged `isPrimary`.
- PK: `(classId, staffId)`

**`subjects`** — subject catalog per division.
- `id` (PK, e.g. `sub-jhs-002`), `schoolId`, `name`, `division`, `category` (`Core` | `Elective`)

**`class_subjects`** — which subjects are taught in which class, by which teacher.
- PK: `(classId, subjectId)`
- `teacherId` → `staff.id`

**`enrollments`** — student in a class for a given year. Promotion creates new rows.
- `id` (PK), `studentId` → `students.id`, `classId` → `classes.id`, `academicYear`, `status` (`Active` | `Completed` | `Repeating`), `enrollmentDate`
- Index: `enrollments_student_year_idx`, `enrollments_class_idx`

### Attendance

**`attendance_sessions`** — one row per class per day.
- `id` (PK), `schoolId`, `classId` → `classes.id`, `date`, `term`, `submittedById` → `staff.id`, `createdAt`
- Index: `attendance_sessions_class_date_idx`

**`attendance_records`** — one row per student per session.
- `id` (PK), `sessionId` → `attendance_sessions.id`, `studentId` → `students.id`, `status` (`present` | `absent` | `late`), `lateReason`, `note`
- Index: `attendance_records_session_idx`

**`staff_attendance_sessions`** — one row per division per day (DH-marked).
- `id` (PK), `schoolId`, `division`, `date`, `term`, `submittedById`, `createdAt`
- Index: `staff_attendance_sessions_div_date_idx`

**`staff_attendance_records`** — one row per staff member per session.
- `id` (PK), `sessionId`, `staffId` → `staff.id`, `status` (`present` | `absent` | `on_leave`), `note`

**`leave_requests`** — staff leave applications.
- `id` (PK), `schoolId`, `staffId`, `staffName`, `type` (`sick` | `maternity` | `personal` | `other`), `startDate`, `endDate`, `reason`, `status` (`pending` | `approved` | `rejected`), `approvedById`, `approvedAt`, `rejectionReason`, `createdAt`

### Lesson plans + schemes

**`lesson_plans`** — with 3-stage review chain. **Soft-deletable** via `deletedAt`.
- `id` (PK), `schoolId`, `teacherId` → `staff.id`, `subjectId` → `subjects.id`, `classId` → `classes.id`, `term`, `week`, `topic`, `learningObjectives`, `teachingMethods`, `resources`, `assessmentPlan`, `fileUrl`, `status` (`draft` | `submitted` | `unit_head_approved` | `approved` | `rejected`), `reviewerComment`, `reviewedById`, `reviewedAt`, `createdAt`, `updatedAt`, `deletedAt`
- Index: `lesson_plans_teacher_status_idx`

**`schemes`** — scheme of work per (teacher, subject, class, term). **Soft-deletable**.
- `id` (PK), `schoolId`, `teacherId`, `subjectId`, `classId`, `academicYear`, `term`, `title`, `description`, `fileUrl`, `createdAt`, `updatedAt`, `deletedAt`

### Exams + scores

**`exams`** — term-based: MidTerm + EndOfTerm per term, per academic year.
- `id` (PK), `schoolId`, `name`, `type` (`MidTerm` | `EndOfTerm`), `term`, `academicYear`, `isPublished`, `publishedAt`, `publishedById`, `createdAt`
- Index: `exams_school_year_term_idx`

**`scores`** — per-student per-subject per-exam.
- `id` (PK), `examId` → `exams.id`, `subjectId` → `subjects.id`, `studentId` → `students.id`, `classId` → `classes.id`, `examScore`, `cat1Score`, `cat2Score`, `groupWorkScore`, `projectWorkScore`, `totalScore`, `grade` (`1` to `9`), `interpretation` (`Highest` / `Higher` / `High` / etc.), `subjectPosition`, `createdAt`, `updatedAt`
- Index: `scores_exam_subject_idx`, `scores_student_idx`

**`class_report_submissions`** — class teacher remarks submitted with end-of-term reports.
- `id` (PK), `examId`, `classId`, `submittedById`, `submittedAt`

**`student_report_remarks`** — per-student personalized remark for a given exam.
- `id` (PK), `examId`, `studentId`, `classTeacherRemark`, `headRemark`, `createdAt`, `updatedAt`

### Other academic

**`assignments`** — per-class assignment with file. **Soft-deletable**.
- `id` (PK), `schoolId`, `teacherId`, `classId`, `subjectId`, `title`, `description`, `dueDate`, `fileUrl`, `createdAt`, `deletedAt`

### Communication

**`announcements`** — title + body, scoped audience.
- `id` (PK), `schoolId`, `authorId` → `staff.id`, `title`, `body`, `audience` (`school-wide` | `<role>` | `division:<X>`), `createdAt`
- Index: `announcements_school_created_idx`

**`calendar_events`** — events list.
- `id` (PK), `schoolId`, `title`, `description`, `date`, `endDate`, `category`, `audience`, `createdAt`

**`appointments`** — parent → teacher meeting requests.
- `id` (PK), `schoolId`, `parentId` → `guardians.id`, `studentId`, `teacherId` → `staff.id`, `requestedDate`, `purpose`, `status` (`pending` | `accepted` | `declined` | `completed`), `teacherResponse`, `createdAt`

### Promotion workflow

**`promotion_seasons`** — one row per (school, academic year). Admin opens it.
- `id` (PK), `schoolId`, `academicYear`, `targetAcademicYear`, `openedById`, `openedAt`, `closedById`, `closedAt`, `status` (`open` | `closed`)

**`promotion_submissions`** — one row per (class, season). Teacher submits.
- `id` (PK), `seasonId`, `classId`, `submittedById`, `submittedAt`, `status` (`submitted` | `approved` | `rejected`), `approvedById`, `approvedAt`, `rejectionReason`

**`promotion_decisions`** — one row per student per submission.
- `id` (PK), `submissionId`, `studentId`, `decision` (`promote` | `repeat` | `withdraw` | `graduate`), `targetClassId`, `reason`, `suggestedDecision`, `suggestedReason`, `failedCoreSubjects`, `createdAt`, `updatedAt`

### Audit + notifications

**`audit_log`** — every sensitive mutation captured.
- `id` (PK), `schoolId`, `userId`, `action` (`SCORE_OVERRIDE` | `STUDENT_EDIT` | `ROLE_CHANGE` | `PROMOTION_APPROVED` | `SCHOOL_SETTINGS_UPDATE`), `targetTable`, `targetId`, `before` (JSON), `after` (JSON), `createdAt`
- Index: `audit_log_action_created_idx`, `audit_log_target_idx`, `audit_log_user_idx`

**`notifications`** — in-app fan-out per recipient.
- `id` (PK), `schoolId`, `userId` → `users.id`, `kind` (9 event types — see §4), `title`, `body`, `link`, `readAt`, `createdAt`
- Index: `notifications_user_read_idx`

### Theming + color tokens

Two orthogonal axes on `<html>`:

1. **`class="dark"`** — toggles light vs dark mode via `next-themes`.
2. **`data-color-scheme="uhas"`** — overrides the brand palette. The root layout renders `<html data-color-scheme="uhas">` so the UHAS palette applies on first paint. Switching to `"default"` removes the attribute.

Both are controlled from the user menu via [`useTheme()`](../src/components/theme-provider.tsx):

```ts
const { theme, setTheme, colorScheme, setColorScheme } = useTheme();

setTheme("dark");          // class="dark"
setColorScheme("uhas");    // data-color-scheme="uhas"
setColorScheme("default"); // removes the attribute
```

All hex values live in `src/app/globals.css`. Components reference them through Tailwind utility classes (`bg-brand`, `text-accent-orange`, etc.). **Never hard-code hex literals in components** — theme switching skips them.

#### Default palette (no `data-color-scheme` set)

```
--brand            #F97316   bright orange — primary CTA
--brand-soft       #FFF7ED   tint for brand backgrounds
--brand-muted      #FED7AA   stronger tint for badges

--accent-orange    #F97316   alias of brand
--accent-teal      #10B981   emerald
--accent-navy      #1E293B   slate-900
--accent-blue      #3B82F6   blue-500
--accent-purple    #8B5CF6   violet-500

--success          #10B981   --success-soft #ECFDF5   --success-muted #A7F3D0
--info             #3B82F6   --info-soft    #EFF6FF   --info-muted    #BFDBFE
--warning          #F59E0B   --warning-soft #FFFBEB   --warning-muted #FDE68A
--sys              #8B5CF6   --sys-soft     #F5F3FF   --sys-muted     #DDD6FE

Chart palette (in order): #F97316 #10B981 #3B82F6 #8B5CF6 #EC4899
```

#### UHAS brand palette (`data-color-scheme="uhas"`, default at boot)

Eyeballed from the school crest — deep forest green + citrus yellow accent.

```
--brand            #1B6B3E   forest green from the crest border
--brand-soft       #E6F4EC   tint background
--brand-muted      #A3D3B5   stronger tint

--accent-orange    #1B6B3E   legacy alias — points at brand so older
                             components using text-accent-orange still render
--accent-teal      #C7D52F   citrus yellow from the leaf in the crest

Chart palette: brand green first, citrus yellow second:
#1B6B3E #C7D52F (then #3B82F6 #8B5CF6 #EC4899 from default)
```

Everything else inherits from the default palette — UHAS overrides only the brand + accent tokens, semantic colors (success / info / warning) stay generic so dashboards stay legible.

#### Light vs dark mode tokens

Defined via `oklch()` so they tune perceptually-uniform brightness. Light mode applies on the root; dark mode applies under `.dark`:

```
Light                       Dark
--background  oklch(1 0 0)         oklch(0.145 0 0)
--foreground  oklch(0.145 0 0)     oklch(0.985 0 0)
--card / popover / muted / etc. all defined under both blocks in globals.css
```

The two axes compose: `class="dark" data-color-scheme="uhas"` gives you dark-mode + UHAS brand colors. All four combinations work.

#### How to add a new color scheme

1. Open `src/app/globals.css`.
2. Add a `:root[data-color-scheme="<your-scheme>"]` block that overrides whichever tokens differ (`--brand`, `--accent-*`, optionally chart slots).
3. Add the scheme to the dropdown in `src/features/shell/components/Header.tsx` (the `colorSchemeOptions` array).
4. Done. No JS changes needed because every Tailwind utility class is wired to the CSS vars.

#### Avatar / status / division color helpers

These aren't part of the theme system — they're feature-local palettes used as Tailwind class strings:

```
Division badges (TeacherClassList.tsx)
  KG               bg-purple-100 text-purple-700
  Lower Primary    bg-sky-100    text-sky-700
  Upper Primary    bg-blue-100   text-blue-700
  JHS              bg-orange-100 text-orange-700

Avatar gradients (UsersTable.tsx, by role)
  Admin            from-slate-600 to-slate-800
  DeputyHead       from-blue-400 to-blue-600
  Teacher          from-emerald-400 to-emerald-600
  Parent           from-amber-400 to-amber-600
```

### Relationship diagram (text)

```
schools
  ├─< school_terms
  ├─< users ─< [audit_log, notifications]
  ├─< staff ─< class_teachers ─> classes
  │         ├─< class_subjects ─> subjects
  │         ├─< attendance_sessions, staff_attendance_sessions
  │         ├─< lesson_plans, schemes (soft-del)
  │         ├─< scores (creator)
  │         ├─< announcements (author)
  │         └─< appointments (teacher), leave_requests
  ├─< students ─┬─< student_guardians >─┬─ guardians
  │            ├─< enrollments ─> classes
  │            ├─< attendance_records ─> attendance_sessions
  │            ├─< scores ─> exams + subjects
  │            ├─< student_report_remarks
  │            └─< promotion_decisions ─> promotion_submissions ─> promotion_seasons
  ├─< classes (per year) ─< enrollments + class_subjects + class_teachers
  ├─< subjects
  ├─< exams ─< scores + student_report_remarks
  └─< calendar_events
```

---

## 6. Known gaps — features that exist but are shallow

Surface-level summary. Full detail with effort estimates in [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md).

| Feature | Hits floor at | Min upgrade | Full upgrade |
|---|---|---|---|
| Leave management | No quota, no docs, no substitute workflow | ~15 h | ~30–40 h |
| Student profile | No siblings, multiple guardians, medical, docs | ~12 h | ~25–30 h |
| Staff management | No qualifications, subject expertise, docs | ~10 h | ~20–25 h |
| Examinations | Verify CAT/Project weight wiring, no mark sheets | ~8 h | ~15–20 h |
| Report cards | No KG variant, no conduct, no batch print | ~12 h | ~30–35 h |
| Audit log filters | No user/target filter, no CSV export | — | ~6–10 h |
| Calendar | List view only — no grid, no recurring | ~10 h | ~20–25 h |
| Announcements | No scheduling, no rich text, no read receipts | — | ~8–12 h |
| Notifications | No category filter, no snooze, no history page | — | ~6–10 h |
| Admin settings | No dirty-state warning, no diff preview | — | ~5–8 h |
| Profile pages | Save Changes, 2FA, Sessions, Notifications, Deactivate UI-only | — | ~12 h |

**Recommended priority order** (highest pain → lowest):

1. **Profile-page completion** — fakes that ship to prod erode trust fast
2. **Student profile depth** (siblings + guardians + medical + docs) — parents see first
3. **Leave management upgrade** — staff use monthly
4. **Audit log filters** — cheap admin win

---

## 7. Missing features (not built at all)

Full competitive ranking in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md). Top Ghana-market gaps:

| Feature | Gap severity | Effort | Why |
|---|---|---|---|
| **Fee management** | Critical | ~40–60 h | Every Ghana school evaluating an SMS asks about fees first. SchoolPad's strongest ground. |
| **SMS gateway** | Critical | ~10–15 h | Ghana parents use feature phones; SMS reaches everyone, in-app doesn't. |
| **WhatsApp integration** | High | ~20–30 h | ~80% Ghana WhatsApp adoption; schools currently run on WhatsApp groups manually. |
| **Timetable / period scheduling** | High | ~30–40 h | Visible weak spot — competitors all have it. We explicitly deferred. |
| **Library management** | Medium | ~20–25 h | Basic schools have libraries; checkout tracking is expected. |
| **Inventory / asset tracking** | Medium | ~20–25 h | Computers, projectors — schools want to track these. |
| **Behavior / discipline tracking** | Medium | ~25–30 h | Demerit logs, incident reports, counselor notes. |
| **Online admissions** | Medium-low | ~25–35 h | Most schools still use paper; demand growing. |
| **AI-assisted lesson plans / report comments** | (Differentiator) | ~25–35 h | Could be us first in the market. |
| **PWA wrapper + offline mode** | High (data-poor) | ~30–50 h | Ghana data is patchy; teachers need offline reads. |

**Explicitly out of scope** for the basic-school market unless a customer asks:
- HR / payroll
- Hostel / boarding
- Transport / bus management
- Cafeteria / meals
- Online classes (video meetings)
- Multi-school tenancy (planned, but as a future major project)

---

## 8. What to do next — three tracks

### Track A — close the depth gaps (~67 h minimum / ~145 h full)

Pick from §6. Order by user-visible pain. Most cost-effective sequence:
1. Profile-page completion (~12 h)
2. Student profile depth (~12 h)
3. Leave management upgrade (~15 h)
4. Audit log filter pack (~6 h)

### Track B — ship features for sales (~140 h for top 5)

Pick from §7. Optimal sequence for revenue:
1. Fee management with Paystack/MoMo (~40–60 h) — biggest revenue lever
2. SMS gateway via mNotify or Hubtel (~10–15 h) — unblocks parent reach
3. Timetable (~30–40 h) — kills a sales objection
4. WhatsApp Business API (~20–30 h) — unique Ghana value-prop
5. Online admissions (~25–35 h) — seasonal but real

### Track C — set up for scale (~50 h)

Before customer #2:
1. Multi-school tenancy refactor — `getCurrentSchoolId` becomes per-request, audit storage paths, scope settings
2. Services-layer refactor — extract business logic out of Server Actions into `services/` so a future JSON API can reuse them
3. JSON API surface — `app/api/*` route handlers for mobile / partner-school clients
4. Background job queue — needed once any single bulk action takes >2s

### Codebase technical debt — almost all done

[CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) tracked 11 items. **10 are shipped** as of 2026-05-21. Remaining:

- **§10 i18n** — defer until a customer asks for Ewe/Twi labels

---

## 9. Where things live — file quick-reference

| Need to | Look at |
|---|---|
| Add or change a DB table | `src/db/schema.ts` → run `pnpm db:generate` |
| Add a feature | `src/features/<name>/` matching the convention in §5 |
| Add a Server Action | `src/features/<name>/actions/` — must return `Promise<ActionResult<T>>` |
| Add a Server Component query | `src/features/<name>/queries/` |
| Add a UI primitive | `src/components/ui/` — copy a shadcn primitive |
| Add a route | `src/app/(dashboard)/<role>/...` |
| Configure school behavior | `src/db/schema.ts:schools` columns + `src/features/settings/` |
| Wire a notification | `src/features/notifications/lib/notify-audience.ts` + the triggering action |
| Send an email | `src/lib/email.ts` |
| Upload a file | `src/lib/firebase-storage.ts` (client) or `src/lib/storage-admin.ts` (server signed URLs) |
| Write to the audit log | `src/lib/audit-log.ts` |
| Format a date | `src/lib/dates.ts` |
| Update conventions | `docs/ENGINEERING-CONVENTIONS.md` |
| Deploy guide | `docs/DEPLOY.md` |

---

## 10. Onboarding a new collaborator or LLM in 10 minutes

Hand them this brief plus the companion docs in this order:

1. [README.md](../README.md) — project state at a glance + scripts + accounts
2. **This file** — full context in one read
3. [docs/ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) — how to write code that fits the project
4. [docs/implementation-spec.md](implementation-spec.md) — phase-by-phase history + next-up specs
5. The relevant one of: [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md), [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md), [CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) depending on which track they're working on
6. [docs/DEPLOY.md](DEPLOY.md) only when they're ready to release

Plus access to:
- The git repo
- Railway dashboard
- Neon project
- Firebase Console for `uhas-sms`
- The seeded test accounts in [README.md](../README.md#test-accounts-emulator)

---

## Test accounts (for local emulator only)

```
admin@uhas.edu.gh           Admin@1234       Mawuli Agbenyega    (Head of School)
dh.jhs@uhas.edu.gh          Deputy@1234      Dzifa Adzogenu      (Deputy Head, JHS)
dh.lower-primary@uhas.edu.gh Deputy@1234     Kodzo Mensah        (Deputy Head, Lower Primary)
dh.upper-primary@uhas.edu.gh Deputy@1234     Edinam Asare        (Deputy Head, Upper Primary)
dh.kg@uhas.edu.gh           Deputy@1234      Akorfa Doe          (Deputy Head, KG)
unit-head.jhs@uhas.edu.gh   Teacher@1234     Akpene Kpodo        (Teacher + Unit Head JHS)
teacher@uhas.edu.gh         Teacher@1234     Selorm Tornu        (Teacher, JHS)
parent@uhas.edu.gh          Parent@1234      Selorm Agbeko       (Parent, 2 children)
```

In prod the same emails exist but with real Firebase passwords seeded via `pnpm seed:firebase`.

---

## TL;DR for a fresh Claude session

> "I'm working on UHAS SMS — a single-tenant school management system live in production on Railway, Neon, and Firebase. It's for a basic school in Ghana (KG → JHS 3) with ~350 students and ~50 staff. Four user roles: Admin, Deputy Head (4 divisions), Teacher (with Unit Head flag), Parent. Built with Next.js 16 App Router, Drizzle + Postgres, Firebase Auth, Tailwind v4, shadcn/ui. 142 Vitest + 8 Playwright tests; CI gates Railway deploys. Most features work end-to-end but several (leave management, student profile, profile pages) are shallow. Roadmap: fee management is the next big feature; multi-tenancy refactor before customer #2. Conventions live in `docs/ENGINEERING-CONVENTIONS.md`. Hand me [task]."
