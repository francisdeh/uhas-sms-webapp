# Phase 3b — Staff Attendance & Leave Requests Design

**Date:** 2026-04-26
**Phase:** 3b (of 3a / 3b / 3c)
**Status:** Approved

---

## Overview

Deputy Heads mark daily attendance for all staff in their division (present / absent / on leave). Staff submit leave requests; Deputy Head approves or rejects. Approved leave auto-pre-fills "On Leave" in the daily attendance sheet. All data uses mock fixtures (`USE_MOCK_DATA=true`).

---

## Routes

| Route | Role | Description |
|---|---|---|
| `/deputy-head/attendance` | DeputyHead | Daily staff marking sheet for their division. `?date=YYYY-MM-DD` navigates to other dates. |
| `/deputy-head/leave` | DeputyHead | All leave requests for their division — approve or reject |
| `/teacher/leave` | Teacher | Own leave history + submit new request |

---

## File Structure

```
src/lib/mock/
  staff-attendance.ts               ← NEW: StaffAttendanceSession + records (3 pre-seeded sessions)
  leave-requests.ts                 ← NEW: LeaveRequest mock data (3 pre-seeded requests)

src/features/attendance/
  types.ts                          ← ADD: StaffAttendanceStatus, StaffAttendanceRecord,
                                            StaffAttendanceSession, StaffSessionWithRecords,
                                            LeaveType, LeaveRequest, CreateLeaveRequestInput
  actions/index.ts                  ← ADD: 6 new actions alongside existing student actions
  components/
    StaffAttendanceSheet.tsx        ← NEW: daily staff marking form
    LeaveRequestList.tsx            ← NEW: Deputy Head approve/reject UI
    LeaveRequestForm.tsx            ← NEW: staff submit leave form
    MyLeaveRequests.tsx             ← NEW: staff's own leave history

src/app/(dashboard)/
  deputy-head/
    attendance/page.tsx             ← NEW: Server Component → StaffAttendanceSheet
    leave/page.tsx                  ← NEW: Server Component → LeaveRequestList
  teacher/
    leave/page.tsx                  ← NEW: Server Component → LeaveRequestForm + MyLeaveRequests
```

---

## Data Model

### New types added to `src/features/attendance/types.ts`

```ts
export type StaffAttendanceStatus = "present" | "absent" | "on_leave";

export type StaffAttendanceRecord = {
  sessionId: string;
  staffId: string;
  status: StaffAttendanceStatus;
  note?: string;
};

export type StaffAttendanceSession = {
  id: string;
  schoolId: string;
  division: "KG" | "Primary" | "JHS";
  date: string;           // "YYYY-MM-DD"
  term: number;
  submittedById: string;
  submittedAt: string;
};

export type StaffSessionWithRecords = StaffAttendanceSession & {
  records: StaffAttendanceRecord[];
};

export type LeaveType = "sick" | "maternity" | "personal" | "other";

export type LeaveRequest = {
  id: string;
  schoolId: string;
  staffId: string;
  staffName: string;        // denormalised for display
  type: LeaveType;
  startDate: string;        // "YYYY-MM-DD"
  endDate: string;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  approvedById?: string;
  approvedByName?: string;
  rejectionReason?: string;
  createdAt: string;
};

export type CreateLeaveRequestInput = {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason?: string;
};
```

### Mock Data

**`src/lib/mock/staff-attendance.ts`** — 3 pre-seeded sessions:

| Session ID | Division | Date | Submitted by |
|---|---|---|---|
| staff-session-JHS-2026-04-24 | JHS | 2026-04-24 | STAFF-002 (Abena Mensah, Deputy Head JHS) |
| staff-session-JHS-2026-04-25 | JHS | 2026-04-25 | STAFF-002 |
| staff-session-Primary-2026-04-25 | Primary | 2026-04-25 | STAFF-003 (Kofi Boateng, Deputy Head Primary) |

Each session has records for all active staff in that division (mix of present/absent/on_leave).

**`src/lib/mock/leave-requests.ts`** — 3 pre-seeded requests:

| ID | Staff | Type | Dates | Status |
|---|---|---|---|---|
| leave-001 | STAFF-005 Kwame Darko (JHS Teacher) | sick | 2026-04-28–2026-04-29 | pending |
| leave-002 | STAFF-006 Gifty Acheampong (Primary Teacher) | personal | 2026-04-30–2026-04-30 | approved (by STAFF-003) |
| leave-003 | STAFF-004 Ama Owusu (HOD JHS) | maternity | 2026-05-01–2026-05-30 | pending |

---

## Server Actions

Added to `src/features/attendance/actions/index.ts` alongside existing student actions.

```ts
// Get staff session + records for a division on a date. Returns null if none exists.
getStaffSessionForDivisionDateAction(
  division: "KG" | "Primary" | "JHS",
  date: string
): Promise<StaffSessionWithRecords | null>

// Create or overwrite a staff session for division+date.
// Session ID: `staff-session-${division}-${date}`
// The submitted records from the form are saved as-is (approved leave pre-fill
// is handled in the UI/page, not enforced here).
saveStaffSessionAction(input: {
  division: "KG" | "Primary" | "JHS";
  date: string;
  term: number;
  submittedById: string;
  records: { staffId: string; status: StaffAttendanceStatus; note?: string }[];
}): Promise<{ success: true; sessionId: string } | { success: false; error: string }>

// List leave requests with optional filters.
// Deputy Head passes { division } to scope to their staff.
// Teacher passes { staffId } to scope to their own requests.
listLeaveRequestsAction(filter?: {
  staffId?: string;
  division?: "KG" | "Primary" | "JHS";
  status?: "pending" | "approved" | "rejected";
}): Promise<LeaveRequest[]>
// Sorted: pending first, then by createdAt descending.

// Staff submits a leave request.
submitLeaveRequestAction(
  staffId: string,
  staffName: string,
  input: CreateLeaveRequestInput
): Promise<{ success: true; id: string } | { success: false; error: string }>
// Guards:
//   - startDate <= endDate
//   - No overlapping pending or approved request for the same staff member

// Deputy Head approves a leave request.
approveLeaveRequestAction(
  id: string,
  approvedById: string,
  approvedByName: string
): Promise<ActionResult>
// Guard: request must be in "pending" status

// Deputy Head rejects a leave request.
rejectLeaveRequestAction(
  id: string,
  rejectedById: string,
  rejectionReason?: string
): Promise<ActionResult>
// Guard: request must be in "pending" status
```

---

## Components

### StaffAttendanceSheet

`"use client"`, same structural pattern as `AttendanceSheet` from Phase 3a.

**Props:**
```ts
interface StaffAttendanceSheetProps {
  session: StaffSessionWithRecords | null;
  division: string;
  date: string;
  term: number;
  staff: Staff[];               // active staff in this division
  approvedLeaveStaffIds: Set<string>; // staffIds with approved leave covering this date
  submittedById: string;
  editable: boolean;
}
```

**Layout:**
- Header: division name + formatted date ("Monday, 25 Apr 2026") + term badge
- If `!editable`: amber Alert banner — "This session is read-only."
- Date navigation input (`<input type="date">`) above the sheet — changing date does `router.push(?date=...)`
- One row per staff member:
  - Left: Avatar (role-coloured initials) + name + rank
  - Right: **Present** (green), **Absent** (red), **On Leave** (blue) toggle buttons
  - Optional note field (collapsible)
- Default state: pre-fill from `session.records` if exists; otherwise staff in `approvedLeaveStaffIds` default to `"on_leave"`, all others to `"present"`
- Footer (only when `editable`): summary count + "Save session" Button
- On save success: `toast.success("Attendance saved.")` + `router.refresh()`

### LeaveRequestList

`"use client"`, props: `{ requests: LeaveRequest[] }`

- Header: "Leave Requests" h1 + pending count badge
- Status filter pills: All / Pending / Approved / Rejected
- DataTable columns: Staff name, Type pill (sick=red, maternity=pink, personal=blue, other=gray), Date range, Reason (truncated), Status pill, Actions
- Actions column (only for pending requests):
  - **Approve** button → AlertDialog confirmation → calls `approveLeaveRequestAction` → updates local state
  - **Reject** button → AlertDialog with optional `<Textarea>` for rejection reason → calls `rejectLeaveRequestAction` → updates local state
- Uses `useTransition` for both actions

### LeaveRequestForm

`"use client"`, props: `{ staffId: string, staffName: string }`

Zod schema:
```ts
z.object({
  type: z.enum(["sick", "maternity", "personal", "other"], { message: "Select a leave type" }),
  startDate: z.string().min(1, { message: "Start date is required" }),
  endDate: z.string().min(1, { message: "End date is required" }),
  reason: z.string().optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
})
```

- Card layout: leave type Select, start date + end date inputs (2-col grid), reason Textarea (optional)
- Submit calls `submitLeaveRequestAction`, on success: `toast.success("Leave request submitted.")` + reset form

### MyLeaveRequests

`"use client"`, props: `{ requests: LeaveRequest[] }`

- Card: "My Leave Requests" heading
- DataTable columns: Type pill, Date range, Reason, Status pill (pending=amber, approved=green, rejected=red), Rejection reason (shown when status is rejected)
- Empty state: "No leave requests submitted yet."

---

## Page Implementations

### `/deputy-head/attendance/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `division` from `getDeputyHeadDivision(user.linkedId)` → `notFound()` if undefined
- `date` from `searchParams.date ?? today`
- `editable = date === today`
- Fetch in parallel:
  - `getStaffSessionForDivisionDateAction(division, date)`
  - `listStaffAction()` → filter to `s.division === division && s.isActive`
  - `listLeaveRequestsAction({ division, status: "approved" })` → build `approvedLeaveStaffIds: Set<string>` (staff whose leave covers `date`: `startDate <= date <= endDate`)
- Renders `<StaffAttendanceSheet ... editable={editable} />`

### `/deputy-head/leave/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `division` from `getDeputyHeadDivision(user.linkedId)`
- `listLeaveRequestsAction({ division })` → all statuses
- Renders `<LeaveRequestList requests={...} />`

### `/teacher/leave/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `listLeaveRequestsAction({ staffId: user.linkedId })` → teacher's own requests
- Renders:
  ```tsx
  <LeaveRequestForm staffId={user.linkedId} staffName={user.displayName} />
  <MyLeaveRequests requests={...} />
  ```

---

## Business Rules

| Rule | Enforcement |
|---|---|
| Deputy Head only sees their division's staff | `listStaffAction()` filtered by `division === user.linkedId division` in page |
| Deputy Head only sees their division's leave requests | `listLeaveRequestsAction({ division })` |
| Approved leave pre-fills "On Leave" | Server page builds `approvedLeaveStaffIds` set; sheet uses it as default |
| Pre-fill is a default, not a lock | Deputy Head can override any status before saving |
| No overlapping leave requests | `submitLeaveRequestAction` checks for existing pending/approved requests overlapping date range |
| Only pending requests can be approved/rejected | Guard in `approveLeaveRequestAction` and `rejectLeaveRequestAction` |
| Session ID is deterministic | `staff-session-${division}-${date}` — enables idempotent create/overwrite |

---

## Constraints

- Student attendance is Phase 3a (independent — no cross-dependency)
- Parent view is Phase 3c (out of scope here)
- `user.displayName` needed for `staffName` in `submitLeaveRequestAction` — derive as `${user.firstName} ${user.lastName}` from session user object
- HOD and Admin roles can also submit leave but are not given a dedicated leave page in this phase — Teacher leave page pattern can be reused for HOD if needed (same route `/hod/leave` would be a separate future task)
