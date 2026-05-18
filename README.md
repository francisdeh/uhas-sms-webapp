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

The defaults in `.env.local.example` work out of the box for local development (`USE_MOCK_DATA=true`, Firebase emulator, Docker DB URL).

### 3. Start the local database

```bash
npm run docker:up
```

This starts PostgreSQL 16 on port `5432` and Adminer (DB browser UI) on port `8080`.

### 4. Push the database schema

```bash
npm run db:push
```

Only needed when `USE_MOCK_DATA=false`. Safe to skip during mock-data development.

### 5. Start the Firebase Auth Emulator

```bash
firebase emulators:start
```

Then seed it with test users (one per role):

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
| `npm run db:push` | Apply Drizzle schema to database |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |
| `npm run seed:emulator` | Seed Firebase Auth Emulator with test users |
| `seed:firebase` | Seed real Firebase project with production users + custom claims (requires `.env.seed`) |

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
| `USE_MOCK_DATA` | `true` skips DB and returns fixture data |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` connects Auth to localhost:9099 |
| `DATABASE_URL` | PostgreSQL connection string |
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
| Adminer (DB browser) | http://localhost:8080 | server: `db` / user: `uhas` / pass: `uhas_dev_secret` / db: `uhas_sms` |
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
| 1 — Auth & User Management | 🔧 Mostly done | Login, role routing, change-password, reset-password, admin user management UI (stats, DataTable, invite flow), dashboard shell (Sidebar, Header, profile page, academic year switcher, search, notifications, dark mode toggle). Non-admin dashboards (Deputy Head, Teacher, Parent) built with live attendance stats and role-scoped content. **Deferred:** reset-password email not yet wired to Firebase (`sendPasswordResetEmail`); session expiry warning modal (5-min before 8h expiry) not yet built. |
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
| 8 — Testing | ⏳ | Per-feature Vitest + RTL + Playwright tests as each module switches off mock data (Phase 8 in spec) |
