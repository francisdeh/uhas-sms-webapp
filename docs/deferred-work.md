# Deferred Work

Single source of truth for work that's intentionally stubbed, waiting on an external integration, or otherwise blocked. Update this file whenever you ship a placeholder; cross items off when you wire them up for real.

Group by what unblocks the item. New items go at the **top** of their section so the freshest stubs surface first.

---

## Needs Firebase Cloud Storage

File uploads currently take a URL string (paste a shared link). To take real binary uploads we need Firebase Cloud Storage wired up + a storage adapter.

- **Student photo upload** — `StudentRegistrationForm` shows a disabled "Upload photo" placeholder. Schema field `students.photoUrl` already exists. ([src/features/students/components/StudentRegistrationForm.tsx](src/features/students/components/StudentRegistrationForm.tsx))
- **Staff photo upload** — same placeholder in `StaffRegistrationForm`. Schema field `staff.photoUrl` exists. ([src/features/staff/components/StaffRegistrationForm.tsx](src/features/staff/components/StaffRegistrationForm.tsx))
- **Lesson plan file attachment** — the form accepts a URL in `fileUrl` field; should accept a real upload. ([src/features/lesson-plans/components/LessonPlanForm.tsx](src/features/lesson-plans/components/LessonPlanForm.tsx))
- **Scheme of Work / Scheme of Learning attachment** — same URL-only pattern. ([src/features/schemes/components/SchemeForm.tsx](src/features/schemes/components/SchemeForm.tsx))
- **Assignment attachment** — URL-only. ([src/features/assignments/components/AssignmentForm.tsx](src/features/assignments/components/AssignmentForm.tsx))

When wired: the placeholder button becomes a real `<input type="file">` with progress UI, drag-and-drop, and a delete option. Each upload writes to Cloud Storage and the resulting URL goes into the existing schema column.

---

## Needs real Postgres / Neon (DB cutover from mocks)

Currently `USE_MOCK_DATA=true` short-circuits every Server Action to read/write in-memory fixtures. After the cutover, switch the env var and the actions hit Drizzle. Module-by-module migration plan in the implementation spec, Phase 8 testing.

Per-module status (✓ = on mocks only, needs DB swap):

- ✓ Students, Staff, Classes, Subjects, Class teachers junction
- ✓ Attendance sessions + records + leave requests
- ✓ Exams, Scores, Class report submissions, Student remarks
- ✓ Lesson plans, Schemes, Assignments
- ✓ Announcements, Appointments, Calendar events
- ✓ Audit log table (defined in schema, never populated)

Things to also rebuild when DB lands:
- **`mustChangePassword` enforcement** — hardcoded `false` in [src/features/auth/queries/get-session-user.ts](src/features/auth/queries/get-session-user.ts). Schema column exists; needs a DB read.
- **`getDeputyHeadDivision` lookup** — currently scans `mockStaff`. Needs a DB query.
- **Audit log writes** — Admin mutations (score overrides, role changes, student edits) should append to `audit_log` but currently don't.

---

## Needs SendGrid (or other email provider) + Cloud Functions

Currently nothing actually sends email. Every "email" trigger logs to console or shows a toast.

- **Reset-password email** — `ResetPasswordForm` shows a success UI but never calls `sendPasswordResetEmail`. ([src/features/auth/components/ResetPasswordForm.tsx](src/features/auth/components/ResetPasswordForm.tsx))
- **Welcome email on staff registration** — spec says one should send via SendGrid with the invite link. Not wired.
- **Critical announcement broadcast** — when an Admin posts an announcement with `isCritical: true`, the target audience should receive an email. Not wired.
- **Appointment notifications** — confirmation / decline / cancellation should email the other party.
- **Report card publish notification** — when Admin publishes an exam, parents should get an email pointing to the report card.

When wired: probably a small Cloud Function listening to relevant Firestore/Postgres triggers, formatting templates, and dispatching via SendGrid. Mock data fields like `isCritical` already exist; the action handlers just need to enqueue the message.

---

## Needs Firebase Auth (real project, not just emulator)

- **Production user provisioning** — `scripts/seed-firebase-users.ts` exists and imports from `src/lib/mock/users.ts`. Run after creating the real Firebase project; needs the service-account `.env.seed` file. Currently only the emulator is seeded automatically.
- **Custom claims pipeline** — server-side login reads `{ role, linkedId }` from custom claims in production. The seed script sets them. After cutover, the cookie-based session can drop its `linkedId` cookie in favour of the claim.
- **Session expiry warning modal** — spec says a 5-min warning before the 8h session expires, with an "extend" option. Not built.

---

## Awaiting school decisions

Things the school needs to confirm before we ship them:

- **End-of-Term composite weighting** — placeholder is 60% exam + 4×10% components ([src/features/exams/utils.ts](src/features/exams/utils.ts) `computeTotalScore`). Confirm with school and change one helper function.
- **KG report-card template** — the current template is geared toward Basic 6. KG may need a narrative-style card with skill-by-skill ticks rather than numeric grades. Need a template from the school.
- **Brand palette** — UHAS theme colours are eyeballed from the crest (`#1B6B3E` primary + `#C7D52F` accent). Replace with official hex values when supplied — single edit at the top of [src/app/globals.css](src/app/globals.css).
- **Logo assets** — Report card + PSC report currently use placeholder `UHAS CREST` / `UHAS SEAL` text circles. Drop real assets in `public/` and replace those divs with `<Image>` tags.

---

## Feature deferrals (non-blocking, future phases)

- **Term switcher** — `mockSchool.currentTerm` is read for the dashboard badge but there's no UI to change it. When the school moves to Term 2, an Admin needs to bump that value. Add a small settings control.
- **Academic year dropdown — historical class snapshots** — switching to 2024/2025 currently shows only the archived exams; the class list is empty. To make the year switch feel complete we'd need parallel class records per year with corresponding enrollments.
- **Lesson plan PDF generation** — submitting a structured plan today stores the content; no PDF render. Could add browser-print or a Cloud Function PDF later.
- **Bulk operations** — bulk score import (CSV), bulk attendance, bulk student promotion at year-end. Promotion workflow is mentioned in the spec but not built.
- **Student promotion workflow** — Class Teacher triggers → Deputy Head approves → new enrollment rows for next year. Spec §5.7. Not built.
- **Notifications inbox** — Header has a `MOCK_NOTIFICATIONS` array. Should pull from a real `notifications` table after DB cutover.
- **Search command (⌘K)** — currently searches static nav items + announcements. Should also search students, staff, classes when real data is connected.
- **Mobile drawer polish** — the sidebar drawer works on mobile but uses a sheet; some long pages may need additional small-screen tweaks.

---

## Known stubs / hardcoded values to revisit

- Header `MOCK_NOTIFICATIONS` array — replace with real query.
- `school-uhas-001` school ID hardcoded in many actions — fine for single-tenant mock; ensure it's not hardcoded after DB.
- Dashboard `Term 1` badge — pulled from `mockSchool.currentTerm` (not hardcoded anymore after the year-switcher refactor), but there's no UI to change the term.
- `proxy.ts` HOD redirect was removed but role labels in some admin tables still mention "HOD" in human-readable form — search the codebase if you spot any.

---

## How to use this file

When you add a feature that depends on something not yet available:
1. Build the UI/schema with a clear placeholder
2. Add a bullet here under the section that unblocks it
3. Link to the file + line where the placeholder lives
4. Cross off / delete the line when you ship the real thing

Keep this short — if something would be a full design doc, link out from here instead of inlining.
