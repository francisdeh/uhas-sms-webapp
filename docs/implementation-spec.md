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
| **1 — Auth & User Management** | 2 weeks | 🔧 Login, reset-password, change-password pages (all using shadcn + react-hook-form + Zod); role-based routing via proxy.ts; session cookie pipeline (uid, role, email, linkedId); Admin user management UI — stats bar, DataTable with filter pills, create/edit modal, deactivate confirmation, invite-link flow; dashboard shell — Sidebar, Header, academic year switcher, global search (⌘K), notifications, dark mode toggle; per-role profile + security settings pages. Non-admin role dashboards (Deputy Head, HOD, Teacher, Parent) built with role-scoped content and live attendance stats. Firebase custom claims pipeline wired: `seed:firebase` script seeds production users, `loginAction` reads `{ role, linkedId }` claims in production. **Deferred items:** (a) `ResetPasswordForm` shows success UI but does not call `sendPasswordResetEmail` — needs real Firebase call; (b) session expiry warning modal (5-min before 8h expiry, with extend option) not yet implemented; (c) `mustChangePassword` enforcement hardcoded to `false` — will be wired when real DB replaces mock in Phase 1 cutover. |
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
| **6c — Email notifications** | deferred | SendGrid wiring for critical announcements + appointment notifications lands when Cloud Functions integration is set up. |
| **7a — Reports dashboards** | 1 week | ✅ `features/reports` with `getSchoolStats`, `getDivisionStats`, `getClassStats`. Admin `/admin/reports` shows school-wide totals, gender breakdown, per-division population, lesson-plan funnel, exam status, today's attendance. Deputy Head `/deputy-head/reports` is the same shape filtered to one division (7-day attendance, lesson-plan funnel, class ranking by aggregate). Teacher `/teacher/reports` aggregates each class the teacher teaches/class-teaches with attendance + subject averages from published exams. |
| **7b — PSC Report** | 0.5 week | ✅ Admin-only printable Population & Staff Census at `/admin/reports/psc` — totals, per-class boy/girl breakdown with division subtotals, school total row, and teachers grouped per division. Reuses the existing report-card print mode (A4, scoped via `body.print-mode-report-card`). |
| **7c — Academic Calendar** | 0.5 week | ✅ New `calendar_events` table (title, description, startDate, endDate?, type: term_start \| term_end \| exam \| holiday \| event, createdById). Admin manages at `/admin/calendar` (add + delete). Read-only `/<role>/calendar` views for Deputy Head, Teacher, Parent showing Upcoming + Past sections. |
| **8 — Testing** | 2 weeks | See section below |
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
- **Fee management, payroll, medical, counselling** — explicitly out of MVP scope

---

*Last updated: 2026-05-18 — Phases 0, 2a–2d, 3, 3.5, 4 (a/b/c), 5 (a/b/c), 6 (a/b), and 7 (a/b/c) complete. Phase 1 has 2 deferred items (reset-password email, session expiry modal). 6c (SendGrid email delivery) deferred. The full MVP feature set is now wired on mock data: auth & user management, students/staff/classes/subjects, attendance, end-to-end exams with workflow & printable report cards, lesson plans + schemes + assignments, announcements + parent-teacher appointments, reports dashboards + PSC report + academic calendar. Next steps: real DB cutover module-by-module (Drizzle to Neon), then Phase 8 testing (Vitest + RTL + Playwright per feature as each switches off mock).*
