# Parent Fee View — Design

**Phase 5, Slice 2** of `v2/UHAS_Migration_Execution_Plan.md` §9, following [Slice 1 — Fee Tracking Core](2026-07-09-fee-tracking-core-design.md). Read-only: a parent can see their own children's fee balances and payment history. No payment recording, no receipt access — those stay Accountant/Admin-only.

## Scope

- Per child: total owed, total outstanding, and an itemized list of every fee they're assigned to (name, amount, balance, status, due date).
- Per fee: payment history (amount, method, date) for transparency — not receipt files (those are Accountant-internal proof-of-payment, not the parent's documents; the response schema omits them entirely rather than relying on the frontend not to render them).
- Multi-child parents get one section per child, stacked — matches `/parent/results` and `/parent/assignments`.
- Fully read-only: no mutations, so this is a pure Server Component, no client-side interactivity needed.

## Backend

Reuses Slice 1's tables and `StudentsService.list_for_guardian` (the existing "resolve this guardian's children" pattern from `students/service.py`, already used by `GET /guardians/{id}/children`) — no new ownership-resolution logic.

**New endpoint**: `GET /fees/my-children` in `apps/api/app/features/fees/router.py`. Gated like every other parent endpoint in this codebase (no `RequireParent` alias exists anywhere — parent endpoints use plain `CurrentUserDep` + a manual `role == PARENT` + `linked_id` check in the service, matching `report_card_svc.py`'s pattern): only a Parent's own children, never another guardian's.

**New schemas** (`schema.py`), deliberately narrower than the Accountant-facing `LearnerFeeRead`/`FeePaymentRead` — no `recordedById`/`recordedByName` (Accountant-internal), no `receiptFileUrls` (not the parent's document):

```
ParentFeePaymentRead: id, amountMinor, method, paidAt
ParentLearnerFeeRead: id, feeItemName, amountMinor, status, balanceMinor, dueDate, payments: list[ParentFeePaymentRead]
ChildFeesRead: studentId, studentFirstName, studentLastName, totalOwedMinor, totalOutstandingMinor, fees: list[ParentLearnerFeeRead]
MyChildrenFeesResponse: children: list[ChildFeesRead]
```

**New repository method**: `list_learner_fees_for_students(session, school_id, student_ids: list[UUID]) -> list[tuple[LearnerFee, Student, FeeItem]]` — same shape as Slice 1's `list_learner_fees_for_school` but filtered to an explicit student-id set instead of the whole school, since a parent's endpoint must never touch `RequireAccountant`'s school-wide query.

**Service**: `FeesService.my_children_fees(session, school_id, user)` — role/`linked_id` guard, then `StudentsService.list_for_guardian` → `list_learner_fees_for_students` → group by student, sum `totalOwedMinor` (Σ `amountMinor`) / `totalOutstandingMinor` (Σ `balanceMinor` where status is `outstanding`/`partial`) per child.

## Frontend

- `apps/web/src/lib/api/client.ts`: `api.fees.myChildren()`.
- `apps/web/src/features/fees/types.ts` + `mappers.ts`: `ChildFees`/`ParentLearnerFee`/`ParentFeePayment` types, `toChildFees` mapper.
- `apps/web/src/app/(dashboard)/parent/fees/page.tsx` — pure Server Component (no `"use client"` anywhere in this slice): session check, `getApi().fees.myChildren()`, map, render inline. One section per child: header (name, total owed, total outstanding via `formatCedis`), then a list of fee cards (name, amount, balance, `LearnerFeeStatusPill` reused from Slice 1, due date, payment history rows).
- Nav: add "Fees" to the Parent nav group in `role-config.ts` (`/parent/fees`, new `Wallet` icon import — matches the icon already used for the Accountant dashboard's outstanding-balance card).
- `loading.tsx` (`variant="list"`, matching `/parent/results`'s data-fetching-route convention).

## Testing

Backend: `apps/api/app/features/fees/tests/test_router.py` additions — a parent sees only their own children's fees (not another guardian's), totals compute correctly across multiple fee items, a non-Parent role gets 403, payment history appears without receipt/recorder fields leaking into the response.

Frontend: no new Vitest units expected (no client-side logic — pure Server Component + existing mapper pattern); verified via `tsc`/`build`.

## Explicitly out of scope for this slice

- Payment recording or receipt access from the parent side.
- SMS reminders (Slice 3).
- Any change to the Accountant-facing endpoints/pages built in Slice 1.
