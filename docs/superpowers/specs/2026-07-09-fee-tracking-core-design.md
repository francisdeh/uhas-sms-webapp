# Fee Tracking Core — Design

**Phase 5, Slice 1** of `v2/UHAS_Migration_Execution_Plan.md` §9 ("Procurement Features"). Phase 5 was decomposed into sequential slices because its full scope (Accountant role, fee management, parent fee view, SMS reminders, possible online payment) is too large for one spec — this doc covers only the first: an Accountant can define fees, assign them to learners, record payments, and see balances/arrears. Parent fee view and SMS reminders are separate follow-on slices.

## Context

A pre-design audit found:
- The Accountant role is already fully wired end-to-end (backend `Role`/`SystemRole` constant, JWT handling, seed data, frontend routing, dashboard placeholder) — only a `RequireAccountant` deps alias and the actual finance pages are missing.
- The fee schema is precisely specified — not aspirational — across three converging docs: `v2/UHAS_Data_Model_v2.0.md` §5.4-5.5, `v2/UHAS_Backend_Architecture_v1.1.md`, and the FRD.
- Zero fee-related code exists today (no tables, no legacy Drizzle-era remnants).
- RLS is not enabled on any application table in this codebase today — every domain (scores, attendance, lesson plans, etc.) relies on FastAPI service-layer authorization only. Treating "RLS: fee tables only" as a first-ever RLS rollout was explicitly considered and rejected for this slice (see Decisions below).
- SMS scaffolding (`sms_log`, `SmsProvider` Protocol, a tested `sms_fanout` Inngest job) exists but has zero live producers — irrelevant to this slice, relevant to the future SMS-reminder slice.
- **Online payment is permanently out of scope**: parents will not pay online. This closes the FRD's own open question and removes `payment_gateway_events`, any `PaymentProvider` integration, and webhook reconciliation from the data model entirely — not just from this slice, but from the product.

`CLAUDE.md` has been updated accordingly: Accountant added to the Role System table, and the "What NOT to Do" fee-management exclusion narrowed to payroll/medical/counselling only.

## Data model

New feature module `apps/api/app/features/fees/`, three tables:

**`fee_items`** — the catalog of chargeable fees.
- `id`, `school_id`
- `name` (text)
- `scope`: `school` | `division` | `class` (closed union, `Final` constants per convention)
- `scope_ref`: nullable text — holds the division value when `scope="division"`, the `class_id` when `scope="class"`, null when `scope="school"`. Polymorphic by design (mirrors how `learner_fees.status` etc. are closed unions); documented clearly in the model docstring to avoid ambiguity.
- `academic_year`, `term` (nullable = annual, matching the existing `schemes`/`exams` convention)
- `amount_minor` (integer, GHS pesewas)
- `is_active`
- `created_at` / `updated_at`

**`learner_fees`** — one row per learner per fee item they're assigned.
- `id`, `school_id`
- `student_id` FK → `students.id`
- `fee_item_id` FK → `fee_items.id`
- `amount_minor` (defaults from the fee item at assignment time, independently editable per learner)
- `status`: `outstanding` | `partial` | `paid` | `waived`
- `balance_minor`
- `due_date` (nullable)
- `deleted_at` — soft-delete, per CLAUDE.md's high-risk-table convention (this is money-tracking data, same tier as scores/lesson plans/schemes)
- `created_at` / `updated_at`
- Unique on `(fee_item_id, student_id)` among non-deleted rows

**`fee_payments`** — one row per payment recorded against a `learner_fees` row.
- `id`, `school_id`
- `learner_fee_id` FK → `learner_fees.id`
- `amount_minor`
- `method`: `cash` | `momo` | `bank` | `cheque` (closed union)
- `reference` (nullable text — e.g. a MoMo transaction id)
- `receipt_file_urls` (JSONB, nullable array of storage paths — same pattern as `scheme_weekly_entries.resource_file_urls`)
- `recorded_by_id` FK → `staff.id`
- `paid_at`
- `created_at`

No `payment_gateway_events` table, no `PaymentProvider` integration — dropped entirely per the online-payment decision above.

## Workflow

1. Accountant creates a `fee_item` with a scope (school-wide / one division / one class), an amount, an academic year, and optionally a term.
2. An explicit "Assign" action resolves the roster for that scope — reusing `notifications/audience.py`'s existing class/division/school resolution logic against `enrollments` — and bulk-inserts one `learner_fees` row per active enrolled student, mirroring `promotions/service.py`'s `_ensure_decisions_for_roster` pattern (insert-if-missing, skip students who already have a row for this fee item). `amount_minor` defaults from the fee item.
3. The Accountant can then edit the amount, waive, or soft-delete (exclude) individual `learner_fees` rows.
4. Recording a payment inserts a `fee_payments` row — amount, method, optional reference, optional multiple receipt file uploads (the Accountant uploads whatever receipt they already issued/collected; the system does not generate one) — and recomputes the parent `learner_fees.balance_minor` and `status` (`outstanding` → `partial` → `paid` as payments accumulate).
5. A balances/arrears view lists `learner_fees` filtered by class/term/status/academic year.

## Auth

Service-layer only, consistent with every other domain in this codebase (per the RLS finding above — there is no existing RLS pattern to extend, so introducing one for fees alone would be inconsistent, not incremental). A `RequireAccountant` FastAPI dependency alias is added in `apps/api/app/core/deps.py` alongside the existing `RequireAdmin`/`RequireAdminOrDeputy` aliases — the pattern is already documented there, just not yet instantiated. Admin retains full access to fees, matching the Admin-sees-everything convention used elsewhere.

## Frontend

New `apps/web/src/features/fees/` module (`types.ts`, `mappers.ts`, `hooks/use-fees.ts`, `components/`), wired into the currently-placeholder `/accountant` dashboard (`apps/web/src/features/shell/role-config.ts` nav, `apps/web/src/app/(dashboard)/accountant/page.tsx`).

Components: fee-item list/create form, per-fee-item assignment roster (assign/edit/waive/exclude), record-payment dialog with a multi-file receipt uploader, balances/arrears list.

Receipt uploads reuse the `FileUploadField` pattern via a new `UploadKind` case (`"fees/receipt"`) in `storage.ts`, capped at **5 MB per file** (tighter than the general-document 20 MB default — receipts are photos/scans, not large documents), accepting PDF/PNG/JPEG only (no DOC/XLS, unlike `schemes/resource`). Confirmed cost-negligible at UHAS's scale (~350 learners, 35+ teachers) against current Supabase Pro pricing (100 GB file storage included, $0.0213/GB overage) — the cap is a UX safeguard, not a cost-control lever.

A small `formatCedis(amountMinor)` currency-formatting helper is added since none exists in the codebase yet (pesewas → GHS display, e.g. `12345` → `GH₵ 123.45`).

## Testing

**Backend** (`apps/api/app/features/fees/tests/`): fee-item CRUD; bulk-assign roster generation (including skip-already-assigned and active-enrollment-only filtering); individual override/waive/exclude; payment recording and balance/status recomputation across multiple partial payments; `RequireAccountant` gating (Accountant + Admin allowed, other roles rejected); `school_id` scoping.

**Frontend**: Vitest coverage for `formatCedis` and any non-trivial component logic, matching existing test conventions.

## Explicitly out of scope for this slice

- Parent fee view — separate follow-on slice.
- Fee-reminder SMS via Hubtel — separate follow-on slice; needs a real `HubtelSmsProvider` and this codebase's first cron-triggered Inngest job (every existing job is event-triggered).
- Online payment gateway — permanently out of scope, per explicit product decision.
- RLS on fee tables — deferred; service-layer auth only for now.
- Receipt PDF generation — not needed; the Accountant uploads the receipt they already issued/collected instead of the system generating one. (The codebase does have a real server-side PDF pipeline — `apps/api/app/features/exams/report_card_pdf.py` via WeasyPrint — should a future slice ever need one; the *Inngest* report-card job, by contrast, is a placeholder-only stub with zero callers and isn't a usable starting point.)
