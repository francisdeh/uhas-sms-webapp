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
| Hosting | Vercel |

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
| Deputy Head (Primary) | dh.primary@uhas.edu.gh | Deputy@1234 |
| HOD | hod@uhas.edu.gh | HOD@12345 |
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

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/           # Login page
│   └── (dashboard)/            # Role-specific dashboards
│       ├── admin/
│       ├── deputy-head/
│       ├── hod/
│       ├── teacher/
│       └── parent/
├── components/
│   ├── dashboard/              # Shell UI (Sidebar, Header, DashboardLayout)
│   └── providers.tsx           # TanStack Query provider
├── db/
│   ├── index.ts                # Neon + Drizzle client
│   └── schema.ts               # All table definitions (15 tables)
├── features/                   # Domain modules
│   ├── auth/
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
└── middleware.ts               # Role-based routing
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `USE_MOCK_DATA` | `true` skips DB and returns fixture data |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` connects Auth to localhost:9099 |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase project config (not needed with emulator) |

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
Head of Basic School
├── Deputy Head — JHS       → Subject Heads → Subject Teachers
├── Deputy Head — Primary   → Class Teachers (Primary 1–6)
└── Deputy Head — KG        → Class Teachers (KG 1–2)
```

Classes: KG 1–2 · Primary 1–6 · JHS 1–3

---

## Development Phases

| Phase | Status | Deliverables |
|---|---|---|
| 0 — Foundation | ✅ Done | DB schema, Firebase emulator, mock fixtures, middleware, folder structure |
| 1 — Auth & User Management | 🔜 Next | Login, role routing, user management |
| 2 — Students & Staff | ⏳ | Registration, records, ID cards |
| 3 — Attendance | ⏳ | Daily attendance, leave requests |
| 4 — Exams & Results | ⏳ | Score entry, grading, report cards |
| 5 — Lesson Plans | ⏳ | Plan creation, approval workflow |
| 6 — Announcements | ⏳ | School-wide and division announcements |
| 7 — Reports & QA | ⏳ | Analytics, exports, UAT |
