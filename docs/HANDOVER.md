# UHAS SMS — Handover Brief

**Self-contained brief.** Paste this single file into a fresh Claude.ai conversation (or hand to a new collaborator) and they'll have everything they need to start working on the codebase. The companion docs in `docs/` exist for depth; they're optional, not required.

Last reviewed: 2026-07-05 — rewritten for the post-Strategy-A stack (Next.js + FastAPI + Supabase). If you're reading a cached/older copy of this file, check the date above against `git log docs/HANDOVER.md` before trusting anything in it.

**Optional companion docs** (load only if going deep on a specific area):
- [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md) — **the current roadmap** — phases 0–7, what's done, what's next
- [implementation-spec.md](implementation-spec.md) — pre-migration phase-by-phase history + spec docs
- [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) — full code-style rule set (28 rules)
- [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) — feature gaps vs market in detail
- [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) — per-feature depth gaps + effort
- [CODEBASE-AUDIT.md](CODEBASE-AUDIT.md) — technical-debt items (pre-migration; largely superseded by the rewrite)
- [PRICING.md](PRICING.md) — commercial model
- [DEPLOY.md](DEPLOY.md) — production deploy checklist

---

## 1. What this software is

**UHAS SMS** is a school-management system being built for **UHAS Basic School**, a basic school (KG → JHS 3) in the Volta Region of Ghana. **This is a demo-phase build — there is no production deployment with real school data yet.** The scale figures below (~350 students, ~50 staff) are the design target this school will actually operate at, not a current live count; the seed script that populates local/demo environments creates a smaller illustrative roster (112 students, 17 staff across 11 classes).

The codebase went through a full backend migration mid-build ("Strategy A"): the original demo was Next.js Server Actions + Neon Postgres + Firebase Auth/Storage; the current and target architecture is **Next.js frontend + FastAPI backend + Supabase (Postgres/Auth/Storage) + Inngest (background jobs)**. That migration is **Phases 0–3 complete** — see [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md), which is now the single roadmap covering both the remaining migration work (Phase 3.5 onward) and new feature requirements.

The product is single-tenant today (one school), and the backend already resolves `school_id` per-request from the JWT rather than a hardcoded constant — multi-tenancy at the data layer is real; what's missing is an onboarding flow to actually create a second school.

**Commercial model**: bespoke build with setup + annual maintenance fee. Pricing detail in [PRICING.md](PRICING.md). Roadmap to multi-tenant SaaS is a later-phase goal, not scheduled.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | **Next.js 16** (App Router) | React, Server Components default. Reads/writes only through the FastAPI client — no direct DB access, no Drizzle. |
| Backend | **FastAPI + SQLAlchemy 2.0 (async) + Alembic** | `apps/api/` — owns all data access + mutations + background jobs. Hand-written migrations, no autogenerate. |
| Styling | **Tailwind v4** | Config in `apps/web/src/app/globals.css` `@theme inline`, no `tailwind.config.ts` |
| UI primitives | **shadcn/ui** + Base UI | Components in `apps/web/src/components/ui/` |
| Forms | **react-hook-form + Zod** | Conventions enforced — no raw HTML inputs in features |
| Database | **PostgreSQL** — Supabase-managed | Local dev via Supabase CLI (`supabase start`); one Postgres, no separate Neon |
| Auth | **Supabase Auth** | Email/password for staff; phone + OTP for parents. Role + `linked_id` in JWT `app_metadata` (server-set, trusted) |
| Storage | **Supabase Storage** | `photos` bucket public-read; `documents` bucket private, signed-URL only. Direct browser→Supabase uploads, gated by Storage RLS policies (`supabase/migrations/`) |
| Background jobs | **Inngest** | SMS fan-out, report generation, lesson-plan-rejection email. Local dev via `docker compose up -d` or `inngest-cli dev` |
| SMS | **Hubtel** — interface + `sms_log` table built, stubbed pending a real account/sender-ID | `StubSmsProvider` logs a fake send today |
| Email | **SMTP via Python** (`apps/api/app/integrations/email/`) | Provider-agnostic; logs instead of sending when unconfigured |
| Hosting | **Railway** — two services (`web`, `api`) | `api` runs `alembic upgrade head` on every deploy; Supabase-platform migrations (Storage policies) are pushed separately via the Supabase CLI |
| CI | **GitHub Actions** | Two jobs: `web` (lint + tsc + Vitest + build), `api` (ruff + mypy + pytest + Alembic-upgrade-from-scratch + OpenAPI/TS drift check). Playwright E2E exists but is disabled (`if: false`) — still targets the pre-migration surface |
| Tests | **Vitest** (unit, co-located with source) + **pytest** (510+ tests, feature-local) | No integration-DB layer on the web side anymore — that logic moved to `apps/api`'s pytest suite, which hits a real transactional Postgres session per test |

---

## 3. User roles + access model

Five roles. Each has its own dashboard route segment. Role-based routing is enforced in [apps/web/src/proxy.ts](../apps/web/src/proxy.ts) (Next 16 renamed middleware → proxy), reading `role` from the JWT's `app_metadata` (never `user_metadata`, which is user-writable).

### `Admin` — `/admin/**`
The Head of School and the school's IT admin sit here. Full school access.

- Register / edit students and staff
- Open/close promotion seasons
- Publish exam results
- Configure school settings (identity, calendar, grading, communication, security, branding)
- Audit log viewer
- Manage user accounts + roles
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
Linked to one or more students via `student_guardians`. Sees only their own children. Can sign in with email + password, or phone + OTP.

- View child's attendance, results, report cards
- Read announcements addressed to them
- See assignments due
- Request appointments with teachers
- View school calendar

### `Accountant` — `/accountant/**`
Added in Phase 3 prep for the fee-management feature (Phase 5 of the migration plan — not yet built). Currently a thin role with minimal scope; the finance domain it will eventually own doesn't exist yet.

---

## 4. Feature inventory (what works today)

Grouped by domain. "Works" means reachable end-to-end through the current FastAPI backend and covered by pytest — this is a demo build, not yet validated against real production usage at scale.

### Identity & access
- Supabase Auth login (email/password staff, phone/OTP parents) with role-aware redirect to dashboard
- Force password change on first login
- Session expiry warning modal with extend button
- Admin can create/deactivate/reactivate users + assign roles + link to staff/guardian rows
- Per-user notification email gating via school-level defaults

### Students
- Register student (full form with photo upload)
- Edit, transfer between classes, deactivate
- Student detail page with academic + attendance summary
- Per-student report card view
- Parent → "My children" view
- Student photos via Supabase Storage

### Staff
- Register staff
- Edit, deactivate
- Unit Head flag with division assignment
- Staff photos
- Staff list per division
- Class teacher assignments

### Classes & subjects
- Classes per division (KG 1/2, Primary 1–6, JHS 1–3 — 11 total in the demo seed)
- Subject definitions per division
- Class-subject mapping per division/year
- Class teacher assignment
- Current academic year + term as core context (configurable in Admin Settings)

### Attendance
- Daily session model per class
- Per-student status: present / absent / late / excused (with reason)
- Bulk "Mark all present"
- Parent view of child's attendance per term
- Staff attendance (Deputy Head marks division staff)
- Session history per class

### Leave management (basic)
- Staff submit leave request (casual / sick / maternity / paternity / study / compassionate / other)
- DH or Admin approve/reject
- *Gaps documented in [FEATURE-ENHANCEMENTS.md §1](FEATURE-ENHANCEMENTS.md) — no balance, no docs, no substitute workflow.*

### Lesson plans
- Teacher submits draft
- Review chain: Teacher → Unit Head (JHS only, where one exists) → Deputy Head
- Rejection emits an Inngest event → notification + email to the teacher (best-effort — a failed emit never fails the review itself)
- File attachment via Supabase Storage signed URLs
- Status enum: draft / submitted / unit_head_approved / approved / rejected
- Full review history preserved server-side (`lesson_plan_reviews` — one row per review event), though the API/UI currently only surfaces the latest reviewer

### Schemes of work
- Per-term scheme upload
- Same Supabase Storage pattern as lesson plans

### Assignments
- Teacher creates per-class assignment with file
- Due date, publish/unpublish toggle
- Parent view of child's assignments

### Examinations
- Per-term exam: Mid-Term + End-of-Term
- Score grid entry by subject + class
- Auto-compute: total score, grade (GES 9-point scale), interpretation, subject position (`apps/api/app/features/exams/compute.py` — pure functions, unit tested)
- Publish/unpublish toggle
- Score override with audit log entry

### Report cards
- Per-student per-term print layout
- Subjects, scores, grades, interpretations
- Term position
- Attendance summary
- **Real PDF rendering is not built yet** — the Phase 3 Inngest report-generation job writes to Supabase Storage, but the PDF body is a placeholder. This is Phase 3.5's first item in the migration plan.
- *Gaps in [FEATURE-ENHANCEMENTS.md §5](FEATURE-ENHANCEMENTS.md) — no KG variant, no conduct, no batch print, no email-to-parent.*

### Promotion workflow
- Admin opens promotion season for an academic year
- Per-class promotion decisions: Promote / Repeat / Withdraw / Graduate
- Teacher submits decisions for their class
- DH approves the submission
- Approval materialises new `enrollments` rows in a transaction with audit log

### Announcements
- Title + body
- Audience scoping: `all` / `division:<X>` / `class:<id>` (`app/features/announcements/audience.py`)
- Notification fan-out to recipients (in-app)
- Email gating via school notification defaults

### SMS (Phase 3, stubbed)
- `sms_log` table + `SmsProvider` interface, one Inngest fan-out job
- `GET /sms-log` (Admin-only) — no UI built for it yet
- Every send today goes through `StubSmsProvider` (fake success, no real message) — real Hubtel integration needs an account + sender-ID first

### Appointments
- Parent requests appointment with a teacher, named time slot (morning/afternoon/after-school)
- Teacher reviews + confirms/declines
- Calendar visibility

### Calendar
- Events list (term start/end, exam, holiday, event) — no grid view yet
- Per-role visibility

### Audit log
- Every sensitive write captured (score override, student edit, role change, promotion approval, settings update)
- Filter by action + date range
- Side-by-side before/after JSON diff with key highlighting

### Notifications
- In-app fan-out across ~9 event kinds (lesson-plan submitted/reviewed, announcement posted, results published, leave submitted/decided, promotion opened, assignment created, …)
- Bell dropdown with unread badge
- 60s client polling

### Admin settings
- Live at `/admin/settings`. Tabs: Identity / Calendar / Grading / Communication / Security / Branding
- School name, motto, logo (uploaded), address, contact, principal
- Academic year + term date ranges
- Grading bands + score component weights + pass mark — actually consumed: `compute.py` uses the school's real values on every score save (not hardcoded), and the score-entry live preview + report-card/PDF grading-key legend now read the same resolved bands/weights instead of a hardcoded copy
- Email from-name + reply-to
- Per-event notification defaults
- Password min length + force-change-on-first-login toggle: **displayed read-only, not editable** — neither is enforced by anything yet (change-password flow hardcodes its own minimum; new users always get `must_change_password=True`), so PATCH doesn't accept them rather than pretending they do something
- Session timeout setting was removed entirely (not `schools`-persisted) — Supabase Auth controls actual session/token expiry, not this app
- Default color scheme + sidebar accent hex
- Every save writes an audit_log row

### Outbound email
- Provider-agnostic `apps/api/app/integrations/email/provider.py` — ported from the old TS `lib/email.ts` in Phase 3, same "log instead of fail when unconfigured" contract
- SMTP wired; first consumer is the lesson-plan-rejection Inngest job
- Toggleable via `school.notification_defaults`
- HTML templates not built yet — every current sender is a plain-text f-string (Phase 3.5-and-later item)

### File uploads
- Supabase Storage with structured paths
- `photos/staff/*`, `photos/students/*`, `photos/school/*` — public read
- `documents/lesson-plans/*`, `documents/schemes/*`, `documents/assignments/*` — signed-URL only
- `UserAvatar` component falls back to initials gradient if no photo
- **Storage RLS policies are required for uploads to work at all** — `storage.objects` has RLS on by default with zero policies out of the box; see `supabase/migrations/` and [DEPLOY.md](DEPLOY.md) §3. This bit a real upload in this session before the policy migration existed.

### Profile pages
- Each role has its own profile page at `/<role>/profile`
- Photo upload, password change, Profile-tab Save Changes (display name + phone, via `PATCH /me`), and Notification preferences are **real** (persist)
- **Notification preferences**: the three toggles that used to be on this tab (announcement emails, attendance alerts, in-app sound) were fictional — none had a real email/sound path behind them anywhere in the codebase. Replaced with the one real preference that exists: a Teacher-only "email me when my lesson plan is rejected" toggle, backed by a new `user_preferences` table (one row per user, created lazily; absent row means "hasn't touched it yet," defaults to the pre-existing always-on behavior, not opted out). Wired into the one real email-sending path in this app (`lesson_plans/service.py`'s rejection-email gate), which now requires *both* the school-level default and this per-user flag.
- 2FA, Active Sessions, Deactivate are still **UI-only** — the remaining independent Profile-page sub-features; each needs its own design (see `docs/superpowers/specs/2026-07-05-profile-save-changes-design.md` and `2026-07-06-notification-preferences-design.md` for how the first two were scoped, as templates).
- The Language dropdown was removed from the Profile tab — no i18n system exists anywhere in this app, so persisting a value nothing reads would be dishonest UI. Re-add once i18n exists — `user_preferences` now exists and could hold it.
- *The pre-migration gap list in [implementation-spec.md "Next up — Profile page completion"](implementation-spec.md#next-up--profile-page-completion) is stale — its implementation mechanics (Firebase MFA, Server Actions) predate Supabase Auth + FastAPI, and its assumed notification types (announcement/attendance emails) turned out not to exist at all. The feature-level intent (persist per-user settings, gate real behavior on them) is still accurate for the remaining pieces; verify what's actually real before assuming the old spec's specifics, same as the last two sub-features did.*

### Demo data seeding
- `pnpm seed:supabase` (from `apps/web/`) — creates the 9 role-anchored Supabase Auth test accounts (auth only)
- `uv run python -m app.scripts.seed` (from `apps/api/`) — reset-only script populating every business-data table (school, staff, students, classes, exams/scores, attendance history, workflow items in every status, comms) with an Ewe/Ghanaian-majority roster matching the school's Volta Region setting. Refuses to run when `ENV=production`.

---

## 5. Architecture at a glance

```
uhas-sms/
├── apps/
│   ├── web/                         # Next.js frontend — UI + API client only
│   │   ├── src/
│   │   │   ├── app/                 # App Router routes
│   │   │   │   ├── (auth)/          #   Login, reset-password, change-password
│   │   │   │   ├── (dashboard)/     #   All role dashboards
│   │   │   │   │   ├── admin/ deputy-head/ teacher/ parent/ accountant/
│   │   │   │   │   ├── error.tsx    #   Boundary — sidebar/header shell stays intact
│   │   │   │   │   └── not-found.tsx
│   │   │   │   ├── error.tsx        # Boundary for auth + root errors
│   │   │   │   ├── not-found.tsx    # Root 404
│   │   │   │   └── global-error.tsx # Last-resort layout-level boundary
│   │   │   ├── components/ui/       # shadcn-style primitives — Card, Button, DataTable, etc.
│   │   │   ├── features/<name>/     # One folder per domain — see below
│   │   │   ├── lib/
│   │   │   │   ├── api/             # server.ts, browser.ts, client.ts — the typed FastAPI client
│   │   │   │   ├── supabase/        # client.ts, server.ts, middleware.ts, admin.ts
│   │   │   │   ├── action-result.ts # ActionResult<T> for the few remaining true Server Actions
│   │   │   │   └── dates.ts         # date-fns wrappers
│   │   │   ├── types/api.d.ts       # Generated from FastAPI's OpenAPI schema — don't hand-edit
│   │   │   └── proxy.ts             # Role-based route guard
│   │   └── scripts/                 # seed-supabase-users.ts (auth accounts only)
│   │
│   └── api/                         # FastAPI backend — owns all data access + mutations + jobs
│       ├── app/
│       │   ├── main.py              # App + router/job registration + error handler
│       │   ├── core/                # Cross-cutting: config, db, deps, security, errors, roles, …
│       │   ├── integrations/        # storage.py, email/, sms/ — Protocol + real + stub adapters
│       │   ├── scripts/seed/        # Demo-data seed script (reset-only)
│       │   └── features/<domain>/   # router.py, schema.py, service.py, repository.py, model.py, jobs/, tests/
│       └── alembic/versions/        # Hand-written migrations, linear history
│
├── supabase/
│   ├── config.toml                  # Local Supabase CLI stack config
│   └── migrations/                  # Supabase-platform config (Storage RLS, etc.) — NOT app schema
│
├── docker-compose.yml                # Local Inngest dev server
├── railway.toml                      # Two-service deploy config
└── v2/                                # Migration plan + architecture docs
```

### Feature module convention (web)

```
apps/web/src/features/<name>/
├── components/       # Domain UI
├── hooks/            # TanStack Query (useQuery/useMutation) calling lib/api/browser.ts
├── queries/          # Server Component reads calling lib/api/server.ts
├── actions/          # ONLY on a couple of features (shell, uploads) — cookie/signed-URL
│                     # Server Actions, never domain mutations
└── types.ts
```

### Feature module convention (api)

```
apps/api/app/features/<domain>/
├── router.py         # HTTP routes, response_model= always set
├── schema.py         # Pydantic Base/Create/Update/Read
├── service.py        # Business logic + invariants
├── repository.py     # The only place this feature touches SQL
├── model.py          # SQLAlchemy ORM model — schema source of truth
├── jobs/              # Inngest functions, if this domain has any
└── tests/             # conftest.py + test_service.py + test_router.py
```

**No `relationship()` exists anywhere in the SQLAlchemy models** — every FK is a plain `mapped_column(Uuid, ForeignKey(...))`, and repositories write explicit queries rather than ORM-graph traversal. See [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) §2.

### Engineering rules of thumb

Top picks (full list of 28 in [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md)):

1. **Server Components by default**; add `"use client"` only when the component needs interactivity, browser APIs, or hooks.
2. **All domain data access goes through FastAPI** — reads via `getApi()`/`queries/`, mutations via TanStack `useMutation`/`hooks/`. `actions/` (`"use server"`) is reserved for cookies + signed URLs, not domain mutations.
3. **Every FastAPI query filters by `school_id`** via `CurrentSchoolIdDep`, resolved from the JWT — not a hardcoded constant.
4. **Migrations only, hand-written, no autogenerate.** `uv run alembic revision -m "…"` then hand-write the `op.*` calls.
5. **Audit-log sensitive mutations** via `apps/api/app/features/audit/service.py`'s `write_audit_log`, in the same transaction as the change.
6. **Forms = react-hook-form + Zod.** No raw `<input>` / `<button>` in feature components.
7. **Tailwind only.** No CSS modules, no inline styles. Conditional classes via `cn()`.
8. **shadcn primitives only** for UI.
9. **UHAS brand palette is the default theme.** Set on `<html data-color-scheme="uhas">` at the root layout.
10. **Pagination `size` caps scale to the domain** — most cap at 100, but small-cardinality lookup resources (classes, staff, calendar) cap at 500. A mismatch here 422s the frontend silently.

---

## 5b. Data model — every table

35 tables across 28 feature domains, one `model.py` per domain under `apps/api/app/features/<domain>/`. This section is a structural map, not a byte-for-byte column dump — read the actual `model.py` before writing code against a table.

**What changed from the pre-migration schema** (worth internalizing before reading the table list below):
- **Every PK is now a UUID** (`server_default=gen_random_uuid()`), not a human-readable string like `STAFF-005`. Entity tables (schools, staff, students, guardians, classes, subjects) keep that readable identifier as a separate `slug` column instead.
- **No ORM relationships** — see §5. There's no `relations.ts`/`with:` equivalent; a repository either does an explicit `.join()` or a follow-up query.
- **Wire format is camelCase, actual columns are snake_case** — Pydantic schemas alias `snake_case` ↔ `camelCase` at the API boundary (`alias_generator=to_camel`); the column lists below use the Python/DB name.
- **`school_id` is resolved from the JWT**, never a hardcoded constant (`CurrentSchoolIdDep`).

### Multi-tenancy anchor

**`schools`** — the school. Single row today; multi-row when tenancy lands.
- `id` (UUID PK), `slug` (globally unique), `name`, `academic_year`, `current_term`, `grading_scale`, `is_active`, `created_at`
- **Settings columns**: `motto`, `address`, `phone`, `email`, `principal_name`, `logo_url`, `grading_bands` (JSONB), `score_weights` (JSONB), `pass_mark`, `email_from_name`, `email_reply_to`, `notification_defaults` (JSONB), `password_min_length`, `force_password_change_on_first_login` (both display-only — not enforced by anything yet), `default_color_scheme`, `sidebar_accent_hex`. `session_timeout_minutes` was removed — Supabase Auth controls session expiry, not this app.

**`school_terms`** — start/end dates per (school, year, term).
- `id`, `school_id` → `schools.id`, `academic_year`, `term` (1/2/3), `start_date`, `end_date`; unique `(school_id, academic_year, term)`

### Auth bridge

**`users`** — bridges the Supabase Auth UUID → DB-side identity. `GET /me` hard-fails (403) if a JWT's `sub` has no matching row here.
- `id` (PK — same value as `auth.users.id`, no server default), `school_id`, `email`, `role`, `linked_id` (points at `staff.id` or `guardians.id`, no enforced FK), `is_active`, `must_change_password`

### People

**`staff`** — every employee (admins + teachers).
- `id` (UUID PK), `slug` (unique per school, e.g. `STAFF-005`), `school_id`, `uhas_id`, `first_name`, `last_name`, `rank`, `system_role`, `division`, `is_unit_head`, `unit_head_of`, `photo_url`, `phone`, `email`, `is_active`, `created_at`

**`students`** — every student.
- `id` (UUID PK), `slug` (e.g. `UHAS-2025-0001`), `school_id`, `first_name`, `middle_name`, `last_name`, `dob`, `gender`, `photo_url`, `phone`, `address`, `nationality`, `religion`, `is_active`, `created_at`

**`guardians`** — parents / family contacts.
- `id` (UUID PK), `slug`, `school_id`, `first_name`, `last_name`, `email` (unique), `phone` (unique) — at least one of email/phone required (app-level Pydantic validator, not a DB constraint on the SQLAlchemy side)

**`student_guardians`** — many-to-many junction, no surrogate id.
- PK `(student_id, guardian_id)`, `relation`, `is_primary`

### Academic structure

**`classes`** — one row per class per academic year.
- `id` (UUID PK), `slug` (e.g. `class-jhs1`), `school_id`, `name`, `division` (required), `academic_year`

**`class_teachers`** — junction, no surrogate id. PK `(class_id, staff_id)`, `is_primary`

**`subjects`** — subject catalog per division.
- `id` (UUID PK), `slug`, `school_id`, `name`, `division`, `category` (`Core` | `Elective` | `Optional`)

**`class_subjects`** — junction, no surrogate id. PK `(class_id, subject_id)`, `teacher_id` → `staff.id` (nullable)

**`enrollments`** — student in a class for a given year. Promotion creates new rows.
- `id`, `student_id` → `students.id`, `class_id` → `classes.id`, `academic_year`, `status` (`Active` | `Repeating` | `Withdrawn`), `enrollment_date`

### Attendance

**`attendance_sessions`** / **`attendance_records`** — one session row per class per day; one record row per student per session (composite PK `(session_id, student_id)`, no surrogate id). Record `status`: `Present` | `Absent` | `Late` | `Excused`.

**`staff_attendance_sessions`** / **`staff_attendance_records`** — same shape, one session per division per day. Record `status`: `Present` | `Absent` | `Late` | `OnLeave`.

**`leave_requests`** — `id`, `school_id`, `staff_id`, `type` (Casual/Sick/Maternity/Paternity/Study/Compassionate/Other), `start_date`, `end_date`, `reason`, `status` (pending/approved/rejected/cancelled), `approved_by_id`, `created_at`

### Lesson plans + schemes

**`lesson_plans`** — soft-deletable (`deleted_at`).
- `id`, `school_id`, `teacher_id`, `subject_id`, `class_id`, `term`, `week`, `topic`, `learning_objectives`, `teaching_methods`, `resources`, `assessment_plan`, `file_url`, `status` (draft/submitted/unit_head_approved/approved/rejected), `created_at`, `updated_at`, `deleted_at`

**`lesson_plan_reviews`** — one row per review event (added when the flat single-review columns proved lossy — a DH approval used to overwrite the Unit Head's own review identity). `id`, `lesson_plan_id`, `reviewer_id`, `decision`, `comment`, `created_at`.

**`schemes`** — soft-deletable. `id`, `school_id`, `teacher_id`, `subject_id`, `class_id`, `type` (work/learning), `term`, `academic_year`, `title`, `content`, `file_url`, `status` (draft/submitted/acknowledged), `reviewer_comment`, `reviewed_by_id`, `reviewed_at`, `submitted_at`

### Exams + scores

**`exams`** — `id`, `school_id`, `name`, `type` (`MidTerm` | `EndOfTerm`), `term`, `academic_year`, `is_published`, `published_at`

**`scores`** — `id`, `exam_id`, `student_id`, `subject_id`, `cat1`, `cat2`, `group_work`, `project_work`, `exam_score`, `total_score`, `grade`, `interpretation`, `subject_position`. **Computed columns are materialised on write by the service** (`app/features/exams/compute.py`) — a bulk-insert script that bypasses the service layer must compute these itself.

**`class_report_submissions`** — one per (exam, class); `status` (draft/submitted), `head_of_school_comment`. **`student_report_remarks`** — one per (exam, student); `class_teacher_remark`.

### Other academic

**`assignments`** — soft-deletable. `id`, `school_id`, `teacher_id`, `class_id`, `subject_id`, `title`, `description`, `due_date`, `file_url`, `status` (draft/published), `published_at`

### Communication

**`announcements`** — `id`, `school_id`, `created_by_id`, `title`, `body`, `audience` (`all` | `division:<X>` | `class:<id>`, plain string with a parser in `audience.py`), `is_critical`. No soft-delete.

**`calendar_events`** — `id`, `school_id`, `title`, `description`, `start_date`, `end_date` (nullable — single-day event), `type` (term_start/term_end/exam/holiday/event), `created_by_id`

**`appointments`** — `id`, `school_id`, `guardian_id`, `student_id`, `teacher_id`, `preferred_date`, `preferred_slot` (morning/afternoon/after_school), `reason`, `status` (pending/confirmed/declined/cancelled), `teacher_response`

### SMS (Phase 3)

**`sms_log`** — `id`, `school_id`, `recipient_phone`, `recipient_guardian_id` (nullable), `category` (absence/results/fee_reminder/announcement/other), `body`, `provider` (stub/hubtel), `provider_message_id`, `status` (queued/sent/delivered/failed), `cost_minor`

### Promotion workflow

**`promotion_seasons`** — one per (school, academic year). **`promotion_submissions`** — one per (class, season). **`promotion_decisions`** — one per student per submission, `decision` (promote/repeat/withdraw/graduate), `target_class_id`.

### Audit + notifications

**`audit_log`** — `id`, `school_id`, `user_id`, `action` (closed set in `app/features/audit/actions.py`), `target_table`, `target_id`, `before` (JSONB), `after` (JSONB), `created_at`

**`notifications`** — `id`, `school_id`, `user_id`, `kind`, `title`, `body`, `link`, `read_at`, `created_at`

### Theming + color tokens

Two orthogonal axes on `<html>`, unchanged by the backend migration:

1. **`class="dark"`** — toggles light vs dark mode via `next-themes`.
2. **`data-color-scheme="uhas"`** — overrides the brand palette. The root layout renders `<html data-color-scheme="uhas">` so the UHAS palette applies on first paint. Switching to `"default"` removes the attribute.

```ts
const { theme, setTheme, colorScheme, setColorScheme } = useTheme();
setTheme("dark");          // class="dark"
setColorScheme("uhas");    // data-color-scheme="uhas"
setColorScheme("default"); // removes the attribute
```

All hex values live in `apps/web/src/app/globals.css`. Components reference them through Tailwind utility classes (`bg-brand`, `text-accent-orange`, etc.) — **never hard-code hex literals in components**, or theme switching skips them. UHAS brand palette: deep forest green (`--brand: #1B6B3E`) + citrus yellow accent (`--accent-teal: #C7D52F`), eyeballed from the school crest. Full token list in `globals.css`; don't duplicate it here where it can drift.

---

## 6. Known gaps — features that exist but are shallow

Surface-level summary, business-logic gaps that are independent of the backend migration. Full detail with effort estimates in [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) (written pre-migration — the gaps themselves are still accurate, the effort estimates may be slightly off since the implementation substrate changed).

| Feature | Hits floor at | Min upgrade | Full upgrade |
|---|---|---|---|
| Leave management | No quota, no docs, no substitute workflow | ~15 h | ~30–40 h |
| Student profile | No siblings, multiple guardians, medical, docs | ~12 h | ~25–30 h |
| Staff management | No qualifications, subject expertise, docs | ~10 h | ~20–25 h |
| Report cards | Real PDF rendering ✅ done — still no KG variant, no conduct, no batch print | ~15 h | ~35–40 h |
| Audit log filters | No user/target filter, no CSV export | — | ~6–10 h |
| Calendar | List view only — no grid, no recurring | ~10 h | ~20–25 h |
| Admin settings UI | ✅ done — all 6 tabs live at `/admin/settings`, wired to real `schools` columns; grading bands/weights actually consumed by score computation + report cards | — | — |
| Profile pages | Save Changes + Notification prefs ✅ done — 2FA, Sessions, Deactivate still UI-only | — | ~12 h |

Rate limiting is done — see Phase 3.5 below. Batch report-card printing remains a separate, larger, explicitly-deferred piece of work (tracked in [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md) §5).

**Recommended priority order** — Phase 3.5 is nearly done (real report-card PDFs ✅, rate-limiting audit ✅, Admin Settings page ✅; three Profile-page sub-features — 2FA, Active Sessions, self-deactivation — still open) — see the migration plan for sequencing, then **Phase 4** for the FRD requirement gaps.

---

## 7. Missing features (not built at all)

Full competitive ranking in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md). Top Ghana-market gaps — this table is a business-priority view; the migration plan's **Phase 5 (Procurement Features)** is the engineering sequencing of the top two:

| Feature | Gap severity | Effort | Why |
|---|---|---|---|
| **Fee management** | Critical | ~40–60 h | Every Ghana school evaluating an SMS asks about fees first. Nothing exists yet — no tables, no Accountant-scoped UI. |
| **Real Hubtel SMS** | Critical | ~10–15 h remaining | Scaffolding done (Phase 3); needs an account + sender-ID, then the real client. |
| **WhatsApp integration** | High | ~20–30 h | ~80% Ghana WhatsApp adoption; schools currently run on WhatsApp groups manually. |
| **Timetable / period scheduling** | High | ~30–40 h | Visible weak spot — competitors all have it. Explicitly deferred. |
| **Library management** | Medium | ~20–25 h | Basic schools have libraries; checkout tracking is expected. |
| **Inventory / asset tracking** | Medium | ~20–25 h | Computers, projectors — schools want to track these. |
| **Behavior / discipline tracking** | Medium | ~25–30 h | Demerit logs, incident reports, counselor notes. |
| **Online admissions** | Medium-low | ~25–35 h | Most schools still use paper; demand growing. |
| **AI-assisted lesson plans / report comments** | (Differentiator) | ~25–35 h | Could be us first in the market. |
| **PWA wrapper + offline mode** | High (data-poor) | ~30–50 h | Ghana data is patchy; teachers need offline reads. |

**Explicitly out of scope** for the basic-school market unless a customer asks:
- HR / payroll, hostel / boarding, transport / bus management, cafeteria / meals, online classes (video meetings)
- Multi-school tenancy (data layer is ready; onboarding flow is a future major project)

---

## 8. What to do next

**The current, single source of truth for sequencing is [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md)** — Phases 0–3 done, then:

- **Phase 3.5 — Platform completion & admin polish**: real report-card PDF rendering ✅, rate-limiting audit ✅, Admin Settings page ✅, Profile page completion (Save Changes ✅, Notifications ✅; 2FA, Active Sessions, self-deactivation still open).
- **Phase 4 — Close requirement gaps**: the 11 Common Core subjects, full Scheme-of-Learning template, named appointment slots, max-two-guardians + sibling links, report-card field additions.
- **Phase 5 — Procurement features**: fee management (biggest revenue lever), real Hubtel SMS, Accountant role scoped to a real finance domain.
- **Phase 6 — Depth & polish**: student/staff profile depth, leave management upgrade, audit-log filters, report-card polish.
- **Phase 7 — Hardening & handover**: Postgres RLS (deliberately deferred — app-layer `school_id` scoping is the current enforcement mechanism, see [ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) §4), Locust load testing, Playwright E2E re-port, deploy checklist finalization.

Don't maintain a second, competing priority list here — if the sequencing changes, update the migration plan and let this section just point at it.

---

## 9. Where things live — file quick-reference

| Need to | Look at |
|---|---|
| Add or change a DB table | `apps/api/app/features/<domain>/model.py` → `uv run alembic revision -m "…"`, hand-write `op.*` |
| Add a feature | `apps/web/src/features/<name>/` (frontend) + `apps/api/app/features/<name>/` (backend) — see §5 |
| Add a FastAPI route | `apps/api/app/features/<domain>/router.py` — always set `response_model=` |
| Add a TanStack Query hook (client mutation) | `apps/web/src/features/<name>/hooks/` |
| Add a Server Component query | `apps/web/src/features/<name>/queries/` calling `lib/api/server.ts` |
| Add a true Server Action (cookie/signed-URL only) | `apps/web/src/features/<name>/actions/` — must return `Promise<ActionResult<T>>` |
| Add a UI primitive | `apps/web/src/components/ui/` — `pnpm dlx shadcn@latest add <name> -y` |
| Add a route | `apps/web/src/app/(dashboard)/<role>/...` |
| Configure school behavior | `apps/api/app/features/schools/` (backend) + `apps/web/src/features/settings/` (UI, partial) |
| Add a background job | `apps/api/app/features/<domain>/jobs/`, registered in `app/main.py` |
| Send an email | `apps/api/app/integrations/email/provider.py` |
| Upload a file | `apps/web/src/lib/supabase/storage.ts` (client) or `lib/storage-admin.ts` (server signed URLs) |
| Write to the audit log | `apps/api/app/features/audit/service.py`'s `write_audit_log` |
| Format a date (frontend) | `apps/web/src/lib/dates.ts` |
| Regenerate frontend API types | `pnpm generate:api-types` (from `apps/web/`), after any backend schema/route change |
| Update conventions | `docs/ENGINEERING-CONVENTIONS.md` |
| Deploy guide | `docs/DEPLOY.md` |
| Seed demo data | `pnpm seed:supabase` (auth) + `uv run python -m app.scripts.seed` (business data) |

---

## 10. Onboarding a new collaborator or LLM in 10 minutes

Hand them this brief plus the companion docs in this order:

1. [README.md](../README.md) — project state at a glance + scripts + accounts
2. **This file** — full context in one read
3. [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md) — current phase status + what's next
4. [docs/ENGINEERING-CONVENTIONS.md](ENGINEERING-CONVENTIONS.md) — how to write code that fits the project
5. The relevant one of: [FEATURE-ENHANCEMENTS.md](FEATURE-ENHANCEMENTS.md), [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) depending on which track they're working on
6. [docs/DEPLOY.md](DEPLOY.md) only when they're ready to release

Plus access to:
- The git repo
- Railway dashboard
- Supabase project dashboard
- The seeded test accounts (below, or the root [README.md](../README.md#test-accounts-supabase-auth))

---

## Test accounts (local Supabase Auth)

Created by `pnpm seed:supabase`; fully functional (real linked staff/guardian rows) once `uv run python -m app.scripts.seed` has also run. See root README for the complete, current table — reproduced here for convenience:

```
admin@uhas.edu.gh              Admin@1234       Mawuli Agbenyega    (Head of School)
dh.jhs@uhas.edu.gh              Deputy@1234      Dzifa Adzogenu      (Deputy Head, JHS)
dh.lower-primary@uhas.edu.gh   Deputy@1234      Kodzo Mensah        (Deputy Head, Lower Primary)
dh.upper-primary@uhas.edu.gh   Deputy@1234      Edinam Asare        (Deputy Head, Upper Primary)
dh.kg@uhas.edu.gh               Deputy@1234      Akorfa Doe          (Deputy Head, KG)
unit-head.jhs@uhas.edu.gh       UnitHead@1234    Akpene Kpodo        (Teacher + Unit Head JHS)
teacher@uhas.edu.gh             Teacher@1234     Selorm Tornu        (Teacher, JHS)
parent@uhas.edu.gh              Parent@1234      Mawuli Agbeko       (Parent — also +233200000001 + OTP 123456)
accountant@uhas.edu.gh          Accountant@1234  Yayra Mensah        (Accountant)
```

No production accounts exist yet — this is a demo-phase build (§1).

---

## TL;DR for a fresh Claude session

> "I'm working on UHAS SMS — a demo-phase school management system for a basic school in Ghana (KG → JHS 3), designed for ~350 students / ~50 staff at full scale. Five roles: Admin, Deputy Head (4 divisions), Teacher (with Unit Head flag), Parent, Accountant. Stack: Next.js 16 frontend (zero direct DB access) + FastAPI/SQLAlchemy/Alembic backend + Supabase (Postgres/Auth/Storage) + Inngest for background jobs. Went through a full backend migration off Drizzle/Firebase/Neon — that's Phases 0–3 done, tracked in `v2/UHAS_Migration_Execution_Plan.md`, which is the current roadmap (Phase 3.5 → 4 → 5 → 6 → 7). 540+ pytest tests on the backend, Vitest unit tests on the frontend; CI gates Railway deploys but Playwright E2E is currently disabled. Most features work end-to-end against real seed data; the remaining Profile-page sub-features (2FA, Active Sessions, self-deactivation) and fee management are the biggest near-term gaps. Conventions live in `docs/ENGINEERING-CONVENTIONS.md`. Hand me [task]."
