# Parent-facing fee receipts — design

Backlog item from `v2/UHAS_Migration_Execution_Plan.md` Phase 6 item 11's remaining-backlog list, chosen by the user as the next item after the onboarding-checklist PR merged.

## Pre-design audit — ground truth

- Phase 5 (fee management) is otherwise fully done: fee items, learner-fee assignment, Accountant-recorded payments, the parent-facing balance view, and weekly SMS overdue reminders are all shipped. Fees are bursar-collected (cash/mobile money paid in person at the school) — there is no payment gateway, so a "payment" is always an Accountant manually recording that money was received.
- `FeePayment` (`apps/api/app/features/fees/model.py`) already has a `receipt_file_urls` JSONB column — whatever proof-of-payment file(s) the Accountant uploads when recording a payment (a photo of a paper receipt, a MoMo screenshot, etc.), via `PaymentReceiptFiles.tsx` in `RecordPaymentDialog.tsx`. There is no system-generated receipt number or PDF anywhere in the codebase — the module docstring is explicit that recording *is* confirming, no gateway/pending state.
- Critically: `ParentFeePaymentRead` (`schema.py:150-161`) already exists as a **deliberately narrower** parent-facing shape, and its docstring explicitly excludes `receiptFileUrls`: "the Accountant's proof-of-payment, not the parent's document." This was a conscious prior design decision, not an oversight.
- The download mechanism this feature would reuse — `ClientDocumentDownloadLink` (`apps/web/src/features/uploads/components/`) + its `signDocumentUrlAction` server action — is already generic and shared across leave documents, scheme resources, and staff/student documents. It mints a signed URL for any storage path given only an authenticated session (no per-path ownership/school check) — a pre-existing trust model already relied on everywhere else in the app, not something this feature changes or introduces.
- The Accountant already sees these files today via the same `ClientDocumentDownloadLink` component in `LearnerFeesTable.tsx` — nothing changes on that side.

## Scope (decided)

Originally scoped broader (a system-generated, sequentially-numbered PDF receipt) during brainstorming, but the user's actual intent was simpler and more direct: **let the parent download whatever proof-of-payment file(s) the Accountant already uploaded** — reversing the existing `ParentFeePaymentRead` exclusion rather than building a new PDF-generation pipeline alongside it.

- No system-generated PDF, no receipt numbering, no new migration.
- No auto-email — purely a visibility change on data that already exists.
- No Accountant-side changes — they already have this view.
- If the Accountant didn't upload anything for a payment, the parent simply sees no download link for that payment (matches the existing `fee.payments.length > 0` conditional-rendering style already used on this page).

## Implementation

**Backend** (2 files):
1. `apps/api/app/features/fees/schema.py` — `ParentFeePaymentRead` (lines 150-161) gains `receipt_file_urls: list[str] = Field(default_factory=list)`; docstring's "no `receiptFileUrls`" clause removed (replaced with an accurate description now that it's exposed).
2. `apps/api/app/features/fees/service.py` — `my_children_fees`'s `ParentFeePaymentRead(...)` construction (~line 393) passes `receipt_file_urls=p.receipt_file_urls or []`, mirroring the existing Accountant-side `_payment_read` in `router.py:86`.

**Frontend** (3 files):
3. `apps/web/src/features/fees/types.ts` (lines 119-127) — `ParentFeePayment` gains `receiptFileUrls: string[]`; the stale "no receiptFileUrls" comment above it is removed/updated.
4. `apps/web/src/features/fees/mappers.ts` — `toParentFeePayment` maps `receiptFileUrls: p.receiptFileUrls ?? []`.
5. `apps/web/src/app/(dashboard)/parent/fees/page.tsx` — renders a `ClientDocumentDownloadLink` per file in `p.receiptFileUrls`, next to the existing "Paid ₵X · method · date" row, only when the array is non-empty.

**Regenerate** `apps/web/src/types/api.d.ts` after the schema change (backend restart + `pnpm generate:api-types`), per the established discipline for any Pydantic schema change.

## Drive-by fixes: Accountant section layout consistency

Flagged by the user mid-implementation while manually testing this feature, then widened into a full audit of the Accountant section against the Staff/Classes reference pages. Four gaps found and fixed:

1. **Card wrapper.** `FeeItemsTable.tsx` and `LearnerFeesTable.tsx` (shared by `BalancesTable.tsx` and the fee-item detail page's `FeeItemRoster.tsx`) rendered their `DataTable` bare on the page background, unlike every other list page (Classes, Staff), which wrap it in `<div className="bg-card border border-border/60 rounded-xl p-4">`. Fixed by adding that same wrapper; `LearnerFeesTable` gained a `bare` prop for the one call site (`FeeItemRoster`) that now supplies its own `Card` wrapper instead (see #4).
2. **Missing StatCards.** Neither Fee Items nor Balances had the "at a glance" `StatCard` row every reference list page has. Added Total/Active/Inactive/This-Year to Fee Items and Total/Outstanding/Paid/Waived to Balances. Balances previously filtered server-side by status (a fresh fetch per dropdown change); switched to fetching the full unfiltered set once and filtering client-side, matching `StaffTable`'s pattern — otherwise the stat counts would only reflect whatever status was currently selected.
3. **Redundant back-link.** `FeeItemRoster.tsx` had a hand-rolled "Back to fee items" `<Link>` that no reference detail page (Staff, Class) has — they rely solely on the shell's breadcrumb, which this page already wires up via `useBreadcrumbLabel`. Removed the link and the now-unused `backHref` prop (and its one call site in `accountant/fee-items/[id]/page.tsx`).
4. **Unsectioned roster table.** The same page's roster table sat bare under the page header, unlike `ClassDetail.tsx`'s "Student Roster (N)" `Card`-with-count-badge treatment. Wrapped it in a `Card` with an "Assigned Roster (N)" title + live count badge.

## Testing

- Backend: extend the existing `my_children_fees` pytest coverage to assert a payment with `receipt_file_urls` set round-trips them correctly into the parent-facing response.
- Frontend: manual browser check — record a payment as Accountant with an uploaded file, confirm the same file downloads correctly from the parent fees page. No new Vitest component tests, consistent with this codebase's existing convention.

## Out of scope

- System-generated PDF receipts / sequential receipt numbering — considered during brainstorming, explicitly declined in favor of the simpler reversal above.
- Auto-emailing a receipt when a payment is recorded.
- Any change to the Accountant-side payment-recording flow or its existing receipt-file upload UI.
- Hardening `signDocumentUrlAction`'s authorization model (session-only, no per-path ownership check) — a pre-existing, app-wide trust model this feature reuses as-is rather than changes.
