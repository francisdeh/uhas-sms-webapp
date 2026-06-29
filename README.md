# UHAS Basic School — Management System

A web-based School Management System for UHAS Basic School, Ghana. Covers student & staff administration, attendance, examinations, lesson plan workflows, and parent communication.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui + lucide-react |
| Database | PostgreSQL 16 (Neon in production, Docker locally) |
| ORM | Drizzle ORM |
| Auth | Firebase Authentication |
| File Storage | Firebase Cloud Storage |
| Client Data | TanStack Query v5 |
| Notifications | Sonner (toasts) |
| Hosting | Railway |

---

## Prerequisites

- Node.js 20+
- Docker Desktop (for local database)
- Firebase CLI (`npm install -g firebase-tools`)

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

```bash
cp .env.local.example .env.local
```

The defaults work out of the box for local development (Firebase emulator + Docker DB on `localhost:5436`).

### 3. Start the local database

```bash
npm run docker:up
```

This starts PostgreSQL 16 on port `5436` and Adminer (DB browser UI) on port `8080`.

### 4. Apply migrations + seed demo data

```bash
npm run db:migrate
npm run db:seed
```

`db:migrate` applies the Drizzle baseline. `db:seed` is idempotent and ports every fixture from `scripts/_seed-data/` into the DB so the demo flows work end-to-end. Use `npm run db:seed:reset` to truncate and re-seed.

### 5. Start the Firebase Auth Emulator

```bash
firebase emulators:start
```

Then seed it with test users (one per row in the `users` table):

```bash
npm run seed:emulator
```

### 6. Start the dev server

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## Test Accounts (Emulator)

| Role | Email | Password |
|---|---|---|
| Admin | admin@uhas.edu.gh | Admin@1234 |
| Deputy Head (JHS) | dh.jhs@uhas.edu.gh | Deputy@1234 |
| Deputy Head (Lower Primary) | dh.lower-primary@uhas.edu.gh | Deputy@1234 |
| Deputy Head (Upper Primary) | dh.upper-primary@uhas.edu.gh | Deputy@1234 |
| Deputy Head (KG) | dh.kg@uhas.edu.gh | Deputy@1234 |
| Teacher (Unit Head — JHS) | unit-head.jhs@uhas.edu.gh | UnitHead@1234 |
| Teacher | teacher@uhas.edu.gh | Teacher@1234 |
| Parent | parent@uhas.edu.gh | Parent@1234 |

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (webpack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run docker:up` | Start PostgreSQL + Adminer |
| `npm run docker:down` | Stop containers |
| `npm run docker:reset` | Wipe DB volume and restart |
| `npm run db:generate` | Generate a new Drizzle migration from schema changes — review the SQL in `drizzle/` then commit it |
| `npm run db:migrate` | Apply pending Drizzle migrations (the only way to change schema — `db:push` is intentionally not used) |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run db:seed` | Seed demo data (idempotent — safe to re-run) |
| `npm run db:seed:reset` | Truncate all tables and re-seed |
| `npm run db:seed:prod` | Seed school + Firebase-backed users only (production minimum) |
| `npm run seed:emulator` | Seed Firebase Auth Emulator with users from the DB |
| `seed:firebase` | Seed real Firebase project with production users + custom claims (requires `.env.seed`) |
| `npm run db:test:setup` | Create `uhas_sms_test` Postgres + apply migrations (one-shot, before first `npm test`) |
| `npm test` | Run the full Vitest suite (`.env.test`) |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:e2e:setup` | Create `uhas_sms_e2e` Postgres + apply migrations (one-shot, before first `npm run e2e`) |
| `npm run e2e:build` | Production build for Playwright (run after schema/UI changes) |
| `npm run e2e` | Run the Playwright E2E suite (`.env.e2e`) — boots `next start` on port 3100 |
| `npm run e2e:ui` | Playwright UI mode |
| `npm run e2e:headed` | Playwright in headed Chromium |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/                 # Unauthenticated pages
│   │   ├── login/
│   │   ├── reset-password/
│   │   └── change-password/
│   └── (dashboard)/            # Role-specific dashboards
│       ├── admin/
│       ├── deputy-head/
│       ├── teacher/
│       └── parent/
├── components/
│   ├── ui/                     # shadcn/ui primitives
│   └── providers.tsx           # TanStack Query provider
├── db/
│   ├── index.ts                # Neon + Drizzle client
│   └── schema.ts               # All table definitions (15 tables)
├── features/                   # Domain modules
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
│   └── (each has: components/, actions/, queries/, types.ts)
├── lib/
│   ├── firebase.ts             # Firebase app + Auth emulator detection
│   ├── mock/                   # Fixture data (active when USE_MOCK_DATA=true)
│   └── utils.ts
└── proxy.ts                    # Role-based routing (Next.js middleware)
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_DRIVER` | Optional. `pg` (Docker / Railway) or `neon-http` (Neon prod). Auto-detected from `*.neon.tech` host. |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` connects Auth to localhost:9099 |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client SDK config (API key, project ID, etc.) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (Admin SDK — server-side only) |
| `FIREBASE_CLIENT_EMAIL` | Service account client email (Admin SDK) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (Admin SDK, use `\n` for newlines in `.env`) |

### Seeding a real Firebase project

To create users in a real Firebase project (production or staging), create a `.env.seed` file (gitignored) with the Admin SDK credentials and run:

```bash
npx dotenv -e .env.seed -- npx tsx scripts/seed-firebase-users.ts
```

This creates one Firebase Auth account per role with the correct custom claims (`{ role, linkedId }`) that map to the mock data IDs. Delete `.env.seed` after seeding.

---

## Local Services

| Service | URL | Credentials |
|---|---|---|
| App | http://localhost:3000 | — |
| Firebase Emulator UI | http://localhost:4000 | — |
| Adminer (DB browser) | http://localhost:8080 | server: `db` / user: `uhas` / pass: `uhas_dev_secret` / db: `uhas_sms` (Docker port `5436` externally) |
| Drizzle Studio | http://localhost:4983 | run `npm run db:studio` |

---

## School Structure

```
Head of Basic School (Admin)
├── Deputy Head — KG              → Class Teachers (KG 1–2)
├── Deputy Head — Lower Primary   → Class Teachers (Primary 1–3)
├── Deputy Head — Upper Primary   → Class Teachers (Primary 4–6)
└── Deputy Head — JHS             → Subject Teachers
```

**Unit Heads** are teachers with an extra flag (`isUnitHead`) — one per division. They keep teaching duties and get an extra sidebar section (Department, Reviews) to manage their unit. The Unit Head role is reassignable by Admin.

Classes: KG 1–2 · Primary 1–6 · JHS 1–3

---

## Development Phases

| Phase | Status | Deliverables |
|---|---|---|
| 0 — Foundation | ✅ Done | DB schema, Firebase emulator, mock fixtures, middleware, folder structure |
| 1 — Auth & User Management | ✅ Done | Login, role routing, change-password, reset-password (wired to Firebase `sendPasswordResetEmail`), admin user management UI (stats, DataTable, invite flow), dashboard shell (Sidebar, Header, profile page, academic year switcher, search, notifications, dark mode toggle). Non-admin dashboards (Deputy Head, Teacher, Parent) with live attendance stats. Session expiry warning modal: a `SessionExpiryWatcher` in `DashboardLayout` reads the `session_expires_at` cookie and shows an AlertDialog 5 min before expiry with a live countdown + Extend / Sign out buttons (Extend re-issues all session cookies for another 8h). |
| 2a — Student Records | ✅ Done | Student list (Admin + Deputy Head scoped), registration form, soft-deactivate/reactivate, division + status filter pills |
| 2b — Student Detail & ID Card | ✅ Done | Student detail view, edit profile, class transfer (with confirmation), printable ID card (browser print + @media print CSS) |
| 2c — Staff Management | ✅ Done | Staff list (Admin-scoped), registration form, role assignment, staff detail + edit + deactivate/reactivate. All on mock data. |
| 2d — Classes & Subjects | ✅ Done | Class list + create (fixed names), subject list + create, class detail with subjects/teacher assignment + student roster. All on mock data. |
| 3 — Attendance | ✅ Done | Student daily attendance (teacher + admin), staff attendance + leave requests (deputy head), parent attendance calendar view. Live attendance stats on Teacher, Deputy Head, and Parent dashboards. All on mock data. |
| 3.5 — Model Reconciliation | ✅ Done | Schema and mocks updated to match user feedback: division split (KG / Lower Primary / Upper Primary / JHS); HOD removed, Unit Head added as a flag on staff with conditional dashboard nav; multiple class teachers per class (junction); staff UHAS ID; student middle name; school-specific grading scale (Highest..Lowest, 1–9); attendance bulk "Mark all present" and required late-reason. |
| 4a — Score Entry | ✅ Done | Schema: scores columns for cat1/cat2/projectWork/groupWork; helpers for total/grade/position/aggregate. Admin: examinations list with create + publish/unpublish. Teacher: examinations landing + score entry grid (Mid-Term = raw 100, End-of-Term = 60% exam + 4×10% components placeholder), auto-computed total/grade, locked when exam published. |
| 4b — Report Card | ✅ Done | Server-rendered, browser-printable report card (`#report-card-print-area`, A4) matching the school template — logo placeholders, header, student info, Core/Elective subject tables with score/position/grade/interpretation, attendance, signatures, grading-scale legend, motto. Parent route `/parent/results/[studentId]/[examId]` (published only). Admin route `/admin/students/[id]/report-card/[examId]` (any exam, with unpublished notice). |
| 4c — Workflow | ✅ Done | New tables `class_report_submissions` + `student_report_remarks`. Class Teacher `/teacher/class-reports`: per-(exam × class) page with one textarea per student for class-teacher remarks; Save draft + Submit to Head of School. Admin `/admin/examinations/[examId]/review`: list of classes with submission status; per-class review page shows each student's class-teacher remark + a textarea for Head of School's comment (per-student save). Report card now renders both remark + comment rows. Publishing locks all remarks/comments. |
| 5a — Lesson Plans | ✅ Done | Teacher `/teacher/lesson-plans`: list, create, edit, delete, submit. Structured form (topic, learning objectives, teaching methods, resources, assessment plan, optional attachment URL). Approval chain: Teacher submits → Unit Head approves at `/teacher/reviews` → Deputy Head approves at `/deputy-head/lesson-plans` → status = approved. Reject with required comment at either stage; teacher edits drop back to draft. Status pill: draft / submitted / unit-head-approved / approved / rejected. |
| 5b — Schemes of Work / Learning | ✅ Done | New `schemes` table (type: `work` \| `learning`, structured `content` and/or `fileUrl`). Teacher `/teacher/schemes`: list + create/edit form with tab toggle between "Write from system" and "Upload URL". Submit to Head of School. Admin `/admin/schemes`: queue of pending submissions, expand to preview, optional comment + Acknowledge. |
| 5c — Assignments | ✅ Done | New `assignments` table. Teacher `/teacher/assignments`: list + create/edit + Publish/Unpublish/Delete with class/subject pickers tied to teacher's assigned subjects. Parent `/parent/assignments`: aggregates published assignments across all linked children's classes; shows due-date status (overdue / due today / upcoming), per-child attribution, attachment links. |
| 6a — Announcements | ✅ Done | New `features/announcements`. Audience = `all` \| `division:<D>` \| `class:<classId>`. Admin (`/admin/announcements`) posts to any audience and can delete any. Deputy Head (`/deputy-head/announcements`) scoped to their division. Parent (`/parent/announcements`) sees school-wide + announcements matching any linked child's division/class. Critical-flag badge surfaces everywhere. |
| 6b — Appointments | ✅ Done | New `appointments` table + feature. Parent `/parent/appointments`: child + teacher picker (teachers derived from child's class subject assignments and class-teacher junction), preferred date/slot, reason. Teacher `/teacher/appointments`: pending inbox with Confirm / Decline (decline requires a reason). Status: pending / confirmed / declined / cancelled; parent can cancel pending requests. |
| 7a — Reports dashboards | ✅ Done | New `features/reports` with stat queries per scope. Admin `/admin/reports`: school totals, gender breakdown, per-division population bars, lesson-plan workflow distribution, exam status, today's attendance progress. Deputy Head `/deputy-head/reports`: division-scoped stats, 7-day attendance, lesson-plan funnel, class ranking by aggregate. Teacher `/teacher/reports`: per-class attendance + subject averages. |
| 7b — PSC Report | ✅ Done | Admin `/admin/reports/psc` renders the printable Population & Staff Census: school totals, per-class boy/girl breakdown with division subtotals, school total, teachers grouped per division with Unit Head flag. Reuses the report-card print mode at A4. |
| 7c — Academic Calendar | ✅ Done | New `calendar_events` table + actions. Admin `/admin/calendar` adds/deletes events (term start/end, exam, holiday, event). Deputy Head, Teacher, Parent all see a read-only `/<role>/calendar` view with Upcoming and Past sections. |
| 5.7 — Student Promotion | ✅ Done | Year-end promotion workflow. After DB cutover, approval materialises real `enrollments` rows (Active for Promote, Repeating for Repeat), flips `students.isActive=false` for Withdraw, and writes one `PROMOTION_APPROVED` audit log row in a single transaction. |
| DB Cutover | ✅ Done | Removed `USE_MOCK_DATA` and the entire `src/lib/mock/` directory. Every action and query now goes through Drizzle. `DB_DRIVER` env var picks `pg` for Docker/Railway or `neon-http` for Neon prod (auto-detects from `*.neon.tech` host). Generated baseline migration; `npm run db:migrate && npm run db:seed` brings up a fresh Postgres with the same demo data as before. Audit log wired for the four sensitive admin mutations. See `docs/superpowers/specs/2026-05-19-db-cutover-design.md`. |
| Audit log viewer | ✅ Done | Admin-only `/admin/audit-log`. Filters by action + date range (default last 30 days), pagination 50/page. Expandable rows show side-by-side before/after JSON with changed-key highlighting. |
| File uploads (Firebase Storage) | ✅ Done | Firebase Storage emulator wired (port 9199). `storage.rules` allows public read for `photos/**` and signed-URL-only for `documents/**`. Reusable `ImageUploadField` / `FileUploadField` / `DocumentDownloadLink` / `UserAvatar`. Photo uploads on student + staff + own profile. File uploads on lesson plans, schemes, assignments. Every avatar in the app prefers the real photo when present. |
| Theme default + UX polish | ✅ Done | UHAS brand palette is now the default — root `<html data-color-scheme="uhas">` so it applies on first paint with no flash. `useTheme().setColorScheme("default")` still removes it. "Mark all present" is now a one-click action on both student and staff attendance sheets — stages everyone as present (keeping approved-leave staff on leave) and immediately saves. |
| 8 — Testing (layers 1 + 2) | ✅ Done | Vitest set up with a separate `uhas_sms_test` Postgres. 128 tests across 10 files (~12 s end-to-end). **Layer 1 (unit, no DB)** covers `computeGrade` / `computeTotalScore` / `assignSubjectPositions` / `computeAggregate`, `computePromotionSuggestion`, `autoPickTargetClass`, `nextAcademicYear`. **Layer 2 (integration, real DB)** covers auth (login, role redirect, mustChangePassword, change-password), students (create + transfer + audit), scores (save + compute + rerank + `SCORE_OVERRIDE` audit), promotions (full transaction: close + Active/Repeating/Withdraw + `PROMOTION_APPROVED` audit), attendance (save + leave-request lifecycle), audit-log helper + viewer queries. Tests caught one real bug: `saveScoresAction` looked up existing rows by a constructed ID that never matched the seed's IDs — now fixed. Scripts: `npm run db:test:setup` (one-shot, creates DB + migrates), `npm test`, `npm run test:watch`. |
| CI workflow | ✅ Done | `.github/workflows/ci.yml` runs on pushes + PRs to `main`/`develop`. Spins up Postgres 16 as a service container, sets up the test DB, then runs lint → tsc → tests → build. No real Firebase secrets needed — dummy placeholders in the workflow env are enough because Next bundles the values at build time and real values only matter at runtime in production. |
| 8 — Testing (layer 3) | ✅ Done | Playwright E2E (chromium only, `next start` against `uhas_sms_e2e`). 7 tests across 5 specs covering the cross-role golden paths: admin registers a student → list shows them; teacher marks an entire roster present in one click; Unit Head approves a submitted lesson plan + Deputy Head approves a unit-head-approved one; admin opens the promotion season + teacher sees their classes; parent opens a published Mid-Term report card. One Playwright `globalSetup` resets the DB, seeds the Firebase Auth Emulator, then logs in each role via the real UI and saves `storageState` so specs start authenticated. Two real production bugs surfaced during E2E and were fixed: Base UI `SelectTrigger` was missing `type="button"`, so clicking a Select inside any form silently fired a form submit; shadcn's `Input` wrapped `@base-ui/react/input` (Field.Control) without a Base UI `<Field>` parent, causing the input to remount on every render and wipe its value. CI runs E2E only on push to `main` (heavy job with the Auth Emulator + a prod build). Scripts: `npm run db:e2e:setup`, `npm run e2e:build`, `npm run e2e`. |
| Outbound email | ✅ Minimum | Provider-agnostic `src/lib/email.ts` (nodemailer). Gmail SMTP for now; swap to Resend/SendGrid later by changing the transport in one place. Wired into lesson-plan rejection (Unit Head + DH). If SMTP vars are unset, emails are logged instead of sent — safe for dev/CI. Reset-password emails are not in this path; Firebase Auth handles those. |
| Profile page completion | ⏭ Next | Shared `Profile & Settings` page mocks most of its surface (Save Changes, 2FA, Active Sessions, Notifications, Deactivate are all UI-only). Photo upload + password change are real. Pick this up next and wire every tab end-to-end. Full punch list + suggested PR order in [docs/implementation-spec.md](docs/implementation-spec.md#next-up--profile-page-completion). |
| Admin Settings page | ⏭ Next | New `/admin/settings` route to configure school identity, academic calendar, grading bands + score weights, communication defaults, security policy (session timeout, password rules), and branding. Surfaces what's currently hardcoded (`DEFAULT_SCHOOL_ID`, `DEFAULT_ACADEMIC_YEAR`, GES grade bands, 8-h session, placeholder weighting) into the `schools` row. ~11 h across 5 PRs. Details in [docs/implementation-spec.md](docs/implementation-spec.md#next-up--admin-settings-page). |
| Drop JHS class streams | ✅ Done | School runs one class per level — no streams. Renamed `class-jhs1a/2a/3a` → `class-jhs1/2/3` and `"JHS 1A/2A/3A"` → `"JHS 1/2/3"` across seed + tests + UI. Deleted the now-dead `stripSuffix`/`streamSuffix` helpers and the three stream-specific tests; tightened the JHS-3-graduates check from `startsWith("JHS 3")` to `=== "JHS 3"`. |

## Roadmap & audits

Persistent reference docs — pick up when you have the time, not in any forced order:

| Doc | Purpose |
|---|---|
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | **Start here** if onboarding a new collaborator or a fresh Claude.ai session — single self-contained brief covering features, roles, gaps, next steps |
| [`docs/COMPETITIVE-ANALYSIS.md`](docs/COMPETITIVE-ANALYSIS.md) | Where we win/lose vs SchoolPad et al; missing features ranked by market impact |
| [`docs/FEATURE-ENHANCEMENTS.md`](docs/FEATURE-ENHANCEMENTS.md) | Depth gaps in features we already shipped (leave, student/staff profiles, exams, report cards, etc.) |
| [`docs/CODEBASE-AUDIT.md`](docs/CODEBASE-AUDIT.md) | Technical-debt items (DB indexes, drizzle relations, loading states, caching, etc.) |
| [`docs/ENGINEERING-CONVENTIONS.md`](docs/ENGINEERING-CONVENTIONS.md) | Coding principles future PRs follow — the load-bearing rules also live in [`CLAUDE.md`](CLAUDE.md) |
| [`docs/PRICING.md`](docs/PRICING.md) | Pricing model, scaling math, negotiation room |
| [`docs/implementation-spec.md`](docs/implementation-spec.md#next-up--commercial-roadmap-drives-sales-readiness) | Engineering-side punch list of the commercial roadmap items |

## Commercial roadmap (drives sales-readiness)

Sales-driven priorities benchmarked against SchoolPad, iSchool, TopHat, ClassEra and other Ghana / West Africa school ERPs. Full reasoning in [`docs/COMPETITIVE-ANALYSIS.md`](docs/COMPETITIVE-ANALYSIS.md); engineering-side punch list in [`docs/implementation-spec.md`](docs/implementation-spec.md#next-up--commercial-roadmap-drives-sales-readiness); pricing model in [`docs/PRICING.md`](docs/PRICING.md).

**Track 1 — close the critical sales-blocking gaps (next 2 months)**

- **Fee management** (~40–60 h) — fee structures, term invoicing, Paystack pay-now (MoMo + card + bank), receipts, bursaries, collection reporting. Single biggest revenue lever; without it, every conversation against SchoolPad ends with "does it handle fees?".
- **SMS gateway** (~10–15 h) — mNotify / Hubtel integration, per-school credit pool, fallback from in-app notifications when users haven't logged in. Reaches the 100% of parents who don't open the app daily.

**Track 2 — kill remaining objections + unblock scale (months 2–4)**

- **Timetable management** (~30–40 h) — period structure, teacher/class/room slotting, conflict detection, substitute overrides on staff leave.
- **Multi-tenancy refactor** (~80 h) — turn the single-school `getCurrentSchoolId()` constant into per-session resolution. **Hard prerequisite for school #2.**

**Track 3 — differentiation + Ghana-specific value (months 4–6)**

- **Mobile PWA** (~30–50 h) — manifest + service worker + offline reads + web push (Android). Differentiates vs SchoolPad's "must be online".
- **WhatsApp Business API** (~20–30 h) — mirror SMS triggers + two-way replies + bulk audience messaging. Replaces ad-hoc WhatsApp groups with structured comms.

**Track 4 — post-PMF, opportunistic**

- AI-assisted lesson plans + report comments (~25–35 h) — premium tier
- Online admissions (~25–35 h) — seasonal but real
- Library / inventory (~30–40 h) — fills the gaps
- Parent-teacher chat (~25–40 h) — differentiator

**Track 5 — defer indefinitely unless a customer asks**

- HR / payroll, hostel, transport, cafeteria, video class, online CBT, alumni.

## Other potential improvements (engineering-only, no commercial urgency)

- **Refactor `actions/` → `services/`** — prerequisite for any non-web client. Costs little now, costs a lot later.
- **JSON API surface** (`app/api/*` route handlers with `Authorization: Bearer` ID-token auth) — for mobile, partner schools, integrations.
- **Capacitor shell** — App Store / Play Store presence with the existing codebase + FCM push.
- **Firebase Cloud Messaging** — server-side push triggers (paired with PWA work above).
- **Offline cache** — last-fetched view stays visible offline. Wait until users complain.
- **Transactional email upgrade** — swap Gmail SMTP for Resend when bulk sends or analytics matter.
- **Component-level tests / mobile-viewport E2E** — gaps left by the current layer-1/2/3 mix.
