# Leave Management Depth — Design

**Phase 6 item 3** of `v2/UHAS_Migration_Execution_Plan.md` §10: "balances, types, documents, substitute — monthly staff use." A pre-design audit found this backlog line half right, half wrong (same pattern as "Staff profile depth," not "Student profile depth"): leave types and the request→approve/reject/cancel workflow already exist; balances, documents, and substitute assignment are genuinely 0% built. The audit also surfaced two real bugs, unrelated to backlog scope, folded into this same PR per the user's call.

## Bugs fixed

**1. Division-scope leak (real authorization bug).** `/deputy-head/leave`'s own code comment claims the server scopes results to the Deputy's division, but `LeaveRequestsRepository`/`Service`/`router` do no division filtering at all — any Deputy Head can currently list, view, and approve/reject *every* staff member's leave school-wide. Fix: `list_for_school` gains an optional `division` filter (join already exists via the `requester` alias — just add `requester.division == division` to the where clause); `LeaveRequestsService.list_for_school`/`get`/`update_status` resolve the actor's division via `StaffRepository.get_by_id` when `actor_role == DEPUTY_HEAD` and enforce it, mirroring the `_assert_can_view_student` pattern already used in `students`/`attendance`. Admin stays unrestricted.

**2. Rejection reason silently discarded.** The reject dialog already collects a reason client-side (`LeaveRequestList.tsx`) but it's never sent — `LeaveStatusUpdate` has no field for it and the backend has nowhere to store it. Fix: new nullable `rejection_reason: Text` column on `leave_requests`; `LeaveStatusUpdate.rejection_reason: str | None` (only meaningful when `status="rejected"`, validated); included in `LeaveRequestRead`; frontend wires the already-collected value through instead of discarding it. Also fixes `LeaveRequest`'s frontend `status` union (`"pending" | "approved" | "rejected"`) to include `"cancelled"`, which the backend has always supported but the type never listed.

**3. No audit log on approve/reject.** Per CLAUDE.md's "audit-log sensitive mutations" convention (role changes, promotion approvals, score overrides). New `LEAVE_DECIDED` action in `audit/actions.py`; `update_status` writes an audit row (before/after status + rejection reason) when transitioning to `approved` or `rejected` — not on `cancelled`, which is self-service and not a "decision."

## Casual leave balance

Only `Casual` leave gets a balance — the other six types don't work as a fixed annual quota in practice (Sick needs documentation not a cap; Maternity/Paternity are fixed statutory durations; Study/Compassionate/Other are situational). Tracking a "balance" for those would be fictional.

- New `schools.casual_leave_annual_days: int` (default 21 — a placeholder like the existing score-weight defaults, Admin-configurable via the existing school settings flow, not a GES-verified number).
- New `GET /leave-requests/balance/{staff_id}` — computed on the fly (entitlement minus the summed inclusive day-count of that staff's `approved` Casual-type requests with `start_date` in the current *calendar* year — a labor-law-style entitlement, not the school's academic year), not a maintained running counter, so it can never drift from the source data. Returns `{entitlementDays, usedDays, remainingDays}`.
- Access: Admin any; Deputy own division (same gate as the rest of this slice); the staff member their own.
- Frontend: shown on `/teacher/leave` (the requester's own balance, above the request form) and per-row on `/deputy-head/leave`'s list.

## Substitute-teacher assignment

A simple annotation field, not a schedule override: `leave_requests.substitute_staff_id: UUID | None` (FK → `staff.id`). Records who's covering, doesn't touch `class_teachers`/`class_subjects`/attendance.

- New `PATCH /leave-requests/{id}/substitute` — `{substituteStaffId: UUID | null}` — Admin or Deputy (own division) only, settable independently of the approve/reject action (a Deputy might assign cover before or after deciding).
- Frontend: a staff picker on each row in `/deputy-head/leave`'s list, visible wherever the request itself is visible.

## Leave request documents

Always optional — no leave type requires an attachment, matching the existing optional `reason` field's precedent.

- New `leave_requests.document_urls: JSONB` (nullable array of storage paths) — a bare path array, not a labelled child table like `student_documents`/`staff_documents`, since there's no ambiguity about who uploaded them (always the requester, at creation time) and no need for a label taxonomy (unlike a birth certificate vs. a transfer letter, "supporting document for my leave request" doesn't need sub-typing).
- Settable only at creation (`LeaveRequestCreate.document_urls: list[str] = []`) — there's no existing "edit a pending request" flow to hang a later-attach feature off, so this stays scoped to what's asked.
- New `UploadKind` case `"leave/document"` in `storage.ts`.
- Frontend: a multi-file upload widget on `LeaveRequestForm.tsx` (mirrors `SchemeResourceFiles.tsx`'s pattern); downloads via the existing `ClientDocumentDownloadLink` on `LeaveRequestList.tsx`/`MyLeaveRequests.tsx`.

## Testing

**Backend**: division-scope enforcement (Deputy sees/approves only own division, Admin sees all, cross-division 403); rejection-reason round-trip; audit-log row written on approve/reject, not on cancel; Casual balance computation (entitlement − used, calendar-year boundary, only Casual counts, only approved counts); substitute assignment access gate; document URLs round-trip on create.

**Frontend**: Vitest coverage for any non-trivial component logic.

## Explicitly out of scope

- Balances for any leave type other than Casual.
- Editing a pending leave request after creation (including adding documents later).
- Automatic class/schedule reassignment when a substitute is set — purely informational.
