# UHAS Basic School SMS — Data Model

**Version:** 2.0
**Date:** June 2026
**Prepared by:** Simplifyd Labs Ltd
**Stack:** Supabase Postgres (accessed by FastAPI via the repository pattern)
**Companions:** FRD v2.0, Backend Architecture v1.1

---

## 1. Overview

This document defines the target data model for UHAS SMS on Postgres, hosted by Supabase, accessed by a FastAPI backend through per-feature **repositories**. It evolves the existing 33-table Drizzle schema rather than replacing it: the relational shapes that work today are preserved, and the changes are scoped to three areas.

- **Authentication** moves from Firebase Auth to Supabase Auth — the `users` bridge table is re-anchored to Supabase `auth.users`, and a profiles pattern carries role + linked identity.
- **New domains** are added: fees, payments, SMS logging, and the full Scheme of Learning template.
- **Row-Level Security (RLS)** is introduced — a Supabase-native capability the current system does not use — to enforce school/division/class scoping at the database layer.

> The ORM question (SQLAlchemy 2.0 + Alembic, with repositories encapsulating access) is covered in the Backend Architecture document. This document is ORM-agnostic and describes tables, columns, keys, and policies.

---

## 2. Design Principles

- Every table that owns school data carries `school_id` — multi-tenancy is a future refactor, not a rewrite.
- Human-readable IDs are preserved where they already exist (e.g. `STAFF-042`, `UHAS-2026-0001`, `class-jhs1`).
- Soft deletes (`deleted_at`) on user-authored content that must be recoverable (lesson plans, schemes, assignments; extended to fees).
- Money stored in **minor units (pesewas) as integers** — never floats — to avoid rounding errors.
- All sensitive mutations write an `audit_log` row.
- RLS policies are the backstop; the FastAPI service layer (via repositories) is the primary enforcement point.

---

## 3. Authentication & Identity Changes

This is the most significant change from the current schema.

### 3.1 From Firebase to Supabase Auth

Today, the `users` table primary key is the Firebase UID, and role + linkedId live in Firebase custom claims, mirrored into the table. Under Supabase Auth:

- Supabase manages `auth.users` (its own schema). Each login identity lives there.
- A public `profiles` table (or the retained `users` table) links `auth.users.id` → role + linked_id, scoped by `school_id`.
- Role is also written into the JWT `app_metadata` at sign-in so RLS policies and FastAPI can read it without a round-trip.
- Session handling moves from Firebase-issued cookies to Supabase JWTs verified by FastAPI.

### 3.2 Parent Login by Phone *(pending confirmation with Mawuli)*

Per the FRD decision, parents authenticate by **phone number**, not email. This changes the `guardians` table: phone becomes the unique, required login identifier; email becomes optional.

- Phone numbers are normalised to **E.164** (`+233...`) on write to prevent duplicates from 0-prefix vs +233 formatting.
- Supabase Auth supports phone-based sign-in; the guardian's phone maps to the auth identity.
- A learner may have up to **two** guardians, each a distinct auth identity — enforced in the service layer and by a check on `student_guardians`.

### 3.3 Revised `users` / `profiles` table

| Column | Type | Notes |
|---|---|---|
| id | uuid (FK `auth.users.id`) | Supabase auth identity — replaces Firebase UID |
| school_id | varchar | Multi-tenancy anchor |
| role | varchar | Admin \| DeputyHead \| Teacher \| Accountant \| Parent |
| linked_id | varchar | FK to `staff.id` \| `guardians.id` |
| login_identifier | varchar | email for staff/admin; phone (E.164) for parents |
| is_active | boolean | Soft disable |
| must_change_password | boolean | First-login flow (staff) |

> **New:** the `Accountant` role is added to the role set, scoped to the finance domain.

---

## 4. Existing Tables (carried forward)

These carry forward from the current schema essentially unchanged except for auth re-anchoring and RLS. Full column lists exist in the current schema and are preserved.

### 4.1 Tenancy & config
| Table | Purpose |
|---|---|
| `schools` | The school + all admin-editable settings (identity, grading bands, score weights, comms, security, branding) |
| `school_terms` | Start/end dates per (school, year, term) |

### 4.2 People
| Table | Purpose | Change |
|---|---|---|
| `staff` | All employees; division, rank, Unit Head flag | RLS only |
| `students` | Learner bio-data, photo, status | Add `other_name` field (staff ask) |
| `guardians` | Parent/family contacts | **phone** becomes unique + required login id; email optional |
| `student_guardians` | M2M student ↔ guardian, relation, primary flag | Enforce max-2 rule |

### 4.3 Academic structure
| Table | Purpose |
|---|---|
| `classes` | One row per class per academic year |
| `class_teachers` | M2M class ↔ staff (multiple class teachers, one primary) |
| `subjects` | Subject catalogue per division (seed the 11 Common Core subjects) |
| `class_subjects` | Which subject taught in which class by which teacher |
| `enrollments` | Student ↔ class per year; drives promotion + **billable-learner count** |

### 4.4 Attendance & leave
| Table | Purpose |
|---|---|
| `attendance_sessions` / `attendance_records` | Daily class attendance; present/absent/late |
| `staff_attendance_sessions` / `staff_attendance_records` | Division staff attendance (DH-marked) |
| `leave_requests` | Staff leave; approve/reject (depth upgrades pending) |

### 4.5 Academics & reporting
| Table | Purpose |
|---|---|
| `exams` | Midterm + End-of-Term per term/year |
| `scores` | Per (exam, student, subject); CAT1/CAT2/group/project/exam + derived total/grade/position |
| `class_report_submissions` | Class-teacher submission of a class's report to Head |
| `student_report_remarks` | Per-student class-teacher remark + Head comment |
| `lesson_plans` | Weekly plan; 3-stage review chain; soft-deletable |
| `schemes` | Scheme of Work per term/subject/class; soft-deletable |
| `assignments` | Per class/subject; parent-visible; soft-deletable |
| `promotion_seasons` / `promotion_submissions` / `promotion_decisions` | End-of-year promotion workflow |

### 4.6 Communication & platform
| Table | Purpose |
|---|---|
| `announcements` | School/role/division/class-scoped notices |
| `calendar_events` | Academic calendar; publish to parents. **Expanded** — see §4.7 and the Academic Calendar Template doc |
| `appointments` | Parent ↔ teacher; slot field to be replaced with named slots |
| `notifications` | In-app notification fan-out |
| `audit_log` | Before/after snapshots of sensitive writes |

### 4.7 Calendar events (expanded)

The real UHAS calendar (see the Academic Calendar Template doc) is a staff-facing, week-organised operational planner with completion status — richer than a simple event list. The `calendar_events` table is revised:

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | Tenancy |
| academic_year | varchar | e.g. "2025/2026" |
| term | integer | 1 / 2 / 3 |
| week | integer (nullable) | **NEW** — term week; shared spine with schemes & lesson plans |
| title | varchar | Activity name |
| description | text | Optional |
| start_date | date | |
| end_date | date (nullable) | For ranges (e.g. CAT 1: May 27–29) |
| category | varchar | **NEW** — term_milestone \| assessment \| submission_deadline \| cpd \| governance \| staff_meeting \| academic \| event \| break \| admissions \| awareness_day |
| audience | varchar | **NEW** — staff \| parents \| students \| all |
| status | varchar | **NEW** — planned \| in_progress \| done \| cancelled |
| created_by_id | FK staff | |
| created_at | timestamp | |

`week` becomes first-class because schemes, lesson plans, and the calendar share the same term-week numbering. `audience` lets one table serve staff/parent/student views (the parent-facing published calendar filters to `parents`/`all`). `status` mirrors the source sheet's STATUS column. The report card's vacation and re-opening dates derive from calendar/term data rather than manual entry.

---

## 5. New Tables

### 5.1 Scheme of Learning (full GES template)

The current `lesson_plans` table holds core fields. The full GES Scheme of Learning adds structured fields. **Recommended:** a dedicated `scheme_of_learning` table linked to the plan, keeping `lesson_plans` lean and letting the SoL be its own reviewable artifact.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | Tenancy |
| teacher_id | FK staff | Author (name auto-filled) |
| class_id / subject_id | FK | Context |
| term / week | integer | |
| week_ending | date | From timetable |
| day_time | varchar | Day + time from timetable |
| strand / sub_strand | text | |
| content_standard | text | |
| performance_indicators | text | |
| resources_equipment | text | Teaching & learning resources |
| keywords | text | |
| core_competencies | text | |
| phase1_starter / phase2_main / phase3_reflection | text | Each with time allocation |
| assessment | text | |
| homework_project | text | Homework/project/community engagement |
| cross_curriculum | text | Cross-cutting issues |
| misconceptions | text | Potential student difficulties |
| remarks | text | |
| file_url | varchar | Optional uploaded PDF/Word alternative |
| status | varchar | draft \| submitted \| unit_head_approved \| approved \| rejected |
| reviewer fields | various | Same review-chain fields as `lesson_plans` |
| deleted_at | timestamp | Soft delete |

### 5.2 Lesson Plan / Scheme Comments

Lets Head of School and Deputy Head add comments to lesson notes and schemes (a school requirement). A general comments table keyed by target.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | Tenancy |
| target_type | varchar | lesson_plan \| scheme \| scheme_of_learning |
| target_id | varchar | The commented artifact |
| author_id | FK staff | Head / Deputy / Unit Head |
| body | text | Comment text |
| created_at | timestamp | |

### 5.3 Appointment Slots

Extends the existing `appointments` table — replaces the free-form slot field with the school's named slots and adds teacher commentary.

| Column | Type | Notes |
|---|---|---|
| slot | varchar (enum) | `snack_break` (10:00–10:20) \| `lunch_break` (12:20–13:05) \| `after_school` (15:05–15:45) |
| teacher_comment | text | Teacher's note on the appointment |

### 5.4 Fee Management (new domain)

Designed worst-case: the system handles payment. If the school keeps payment at the bursar, the gateway/webhook portions become inactive but the tracking tables remain valid.

**`fee_items`**

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | Tenancy |
| name | varchar | Tuition, PTA dues, exam fee, feeding, etc. |
| scope | varchar | class \| division \| school |
| scope_ref | varchar | class_id / division when scoped |
| academic_year | varchar | |
| term | integer (nullable) | Null = annual fee |
| amount_minor | integer | Pesewas (GHS × 100) |
| is_active | boolean | |

**`learner_fees`** — assignment of a fee item to a specific learner, supporting include/exclude of individuals.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | |
| student_id | FK students | |
| fee_item_id | FK fee_items | |
| amount_minor | integer | Copy of item amount (allows per-learner override) |
| status | varchar | outstanding \| partial \| paid \| waived |
| balance_minor | integer | Running balance in pesewas |
| due_date | date | |
| created_at | timestamp | |

**`fee_payments`**

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | |
| learner_fee_id | FK learner_fees | What is being paid |
| amount_minor | integer | Pesewas paid |
| method | varchar | cash \| momo \| card \| bank \| gateway |
| reference | varchar | Receipt no. or gateway transaction ref |
| status | varchar | recorded \| pending \| confirmed \| failed |
| recorded_by_id | FK staff | Accountant who recorded (null if gateway) |
| paid_at | timestamp | |
| created_at | timestamp | |

**`payment_gateway_events`** *(only if online payment confirmed)*

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| provider | varchar | paystack \| hubtel \| other |
| event_type | varchar | charge.success, etc. |
| raw_payload | jsonb | Full webhook body for audit |
| matched_payment_id | FK fee_payments | Reconciliation link |
| processed_at | timestamp | Idempotency guard |

### 5.5 SMS Log (Hubtel)

Every SMS attempt is logged for delivery tracking, cost accounting, and audit.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | |
| school_id | varchar | |
| recipient_phone | varchar | E.164 |
| recipient_guardian_id | FK guardians (nullable) | When tied to a parent |
| category | varchar | absence \| results \| fee_reminder \| announcement \| other |
| body | text | Message sent |
| provider | varchar | hubtel |
| provider_message_id | varchar | Returned id for delivery callback |
| status | varchar | queued \| sent \| delivered \| failed |
| cost_minor | integer | Pesewas, for billing/accounting |
| created_at / updated_at | timestamp | |

---

## 6. Row-Level Security (RLS)

RLS is new in this architecture. Policies enforce data isolation at the database, beneath the FastAPI service/repository layer. The role and `school_id` travel in the JWT `app_metadata`, readable by policies.

### 6.1 Core policy patterns
- **Tenancy:** every owned table requires `school_id = (jwt ->> 'school_id')` for all operations.
- **Teacher scope:** scores/attendance writes restricted to classes the teacher is assigned to (via `class_subjects` / `class_teachers`).
- **Parent scope:** a parent can read only rows tied to their linked student(s) through `student_guardians`.
- **Accountant scope:** read/write on fee tables; no access to scores, lesson plans, or attendance.
- **Division scope:** Deputy Head reads/writes limited to rows in their division.
- **Admin:** full access within the school.

### 6.2 Enforcement layering
RLS is the backstop, not the only guard. The FastAPI service layer (through repositories) performs the primary authorization — clear errors, business rules — while RLS guarantees that even a logic bug cannot leak cross-tenant or cross-scope data. **Service-role** connections (used by trusted background jobs) bypass RLS deliberately and must be used only in vetted server code, never exposed to the client.

---

## 7. Billable-Learner Query

The commercial model bills on active enrolment. This is a clean query and should be a defined view for invoicing.

- **Billable learners** = count of `enrollments` where `status = 'Active'` and `academic_year = current year`, scoped to `school_id`.
- Alumni/withdrawn (Completed/Repeating/withdrawn) retain records but are excluded from the billable count.

---

## 8. Entity Relationship Summary

High-level relationships (existing + new):

- `schools` 1—* everything (tenancy).
- `auth.users` 1—1 `profiles` *—1 `staff` | `guardians` (identity).
- `students` *—* `guardians` via `student_guardians` (max 2 guardians).
- `students` 1—* `enrollments` *—1 `classes` (per year).
- `classes` *—* `subjects` via `class_subjects` *—1 `staff` (teacher).
- `exams` 1—* `scores` *—1 `students` + `subjects`.
- `students` 1—* `learner_fees` *—1 `fee_items`; `learner_fees` 1—* `fee_payments`.
- `guardians` 1—* `sms_log` (parent messaging); `fee_payments` 0—1 `payment_gateway_events`.
- `lesson_plans` / `schemes` / `scheme_of_learning` 1—* `comments`.

---

*End of Data Model. The Backend Architecture document defines how FastAPI exposes and enforces this model.*
