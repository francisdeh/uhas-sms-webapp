# Phase 3c — Parent Attendance View Design

**Date:** 2026-04-26
**Phase:** 3c (of 3a / 3b / 3c)
**Status:** Approved

---

## Overview

Parents view their child(ren)'s daily attendance in read-only mode. The page shows a summary (total sessions, present %, absent count, late count) and a monthly calendar with colour-coded status for each school day. If a parent has multiple children, a URL search param (`?studentId=...`) selects which child to display — defaulting to the first linked child. All data uses mock fixtures (`USE_MOCK_DATA=true`).

---

## Routes

| Route | Role | Description |
|---|---|---|
| `/parent/attendance` | Parent | Child attendance summary + monthly calendar. `?studentId=STUDENT-ID` selects which child (defaults to first linked). |

Read-only — no mutations.

---

## File Structure

```
src/lib/mock/
  student-guardians.ts              ← NEW: Record<guardianId, studentId[]> mapping

src/features/attendance/
  types.ts                          ← no changes (reuses AttendanceStatus from Phase 3a)
  actions/index.ts                  ← ADD: getStudentAttendanceCalendarAction
  components/
    ParentAttendanceView.tsx        ← NEW: summary stat cards + monthly calendar

src/app/(dashboard)/
  parent/
    attendance/page.tsx             ← NEW: Server Component → ParentAttendanceView
```

---

## Mock Data

**`src/lib/mock/student-guardians.ts`**

```ts
export const mockStudentGuardians: Record<string, string[]> = {
  "PARENT-001": ["STUDENT-001", "STUDENT-003"],
};
```

`PARENT-001` is the guardian linked to the `parent@uhas.edu.gh` test account (`user.linkedId`). `STUDENT-001` is enrolled in class-jhs1a and has attendance sessions from Phase 3a mock data. `STUDENT-003` is a second child with no sessions — exercises the empty-state path.

No changes to existing student or attendance mock files.

---

## Server Action

Added to `src/features/attendance/actions/index.ts` alongside existing student and staff actions.

```ts
// All sessions for a student's class where a record exists for that student.
// Returns sorted oldest → newest (calendar renders left-to-right, top-to-bottom).
getStudentAttendanceCalendarAction(
  studentId: string,
  classId: string
): Promise<{ date: string; status: AttendanceStatus }[]>
```

The page derives summary totals (total, present, absent, late, pct) from this same array — no separate summary action call is needed.

---

## Component

### ParentAttendanceView

`"use client"`, props:

```ts
interface ParentAttendanceViewProps {
  students: { id: string; name: string; classId: string; className: string }[];
  selectedStudentId: string;
  records: { date: string; status: AttendanceStatus }[];
}
```

**Layout:**

- **Header:** "Attendance" h1
  - If `students.length > 1`: a Select component that calls `router.push(/parent/attendance?studentId=...)` on change — currently selected child shown as the Select value
  - If single child: child's name shown as a subtitle below the h1
- **Summary row** — 4 stat cards (derived from `records`):
  - Total Sessions (neutral)
  - Present (green) — count + percentage (`Math.round(present/total*100)%`)
  - Absent (red) — count
  - Late (amber) — count
- **Monthly calendar:**
  - Local state: `displayedMonth` (`useState`, initialised to current month)
  - Prev / Next chevron buttons update `displayedMonth` (no server round-trip)
  - Month+year heading centered between the nav buttons ("April 2026")
  - Grid: Mon–Fri column headers + day cells for the displayed month
  - Day cell: shows the day number; background dot colour:
    - green — `"present"`
    - red — `"absent"`
    - amber — `"late"`
    - no dot — no session recorded for that date
  - Days outside the displayed month shown as empty/muted cells (no dot)
  - Legend below the grid: three colour swatches labelled Present / Absent / Late
- **Empty state** (no records for the selected child): muted text — "No attendance records yet for this child."

---

## Page Implementation

### `/parent/attendance/page.tsx` (Server Component)

```tsx
// 1. getSessionUser() → redirect("/login") if null
//    guardianId = user.linkedId  (e.g. "PARENT-001")

// 2. studentIds = mockStudentGuardians[guardianId] ?? []
//    if studentIds.length === 0: notFound()

// 3. Build students array: map studentIds → { id, name, classId, className }
//    by looking up each in mockStudents and mockClasses

// 4. selectedStudentId = searchParams.studentId ?? students[0].id
//    Security guard: if searchParams.studentId is set but NOT in studentIds →
//      redirect("/parent/attendance")  (prevents cross-guardian data access)

// 5. selectedStudent = students.find(s => s.id === selectedStudentId)!

// 6. records = await getStudentAttendanceCalendarAction(
//      selectedStudent.id,
//      selectedStudent.classId
//    )

// 7. Renders:
<ParentAttendanceView
  students={students}
  selectedStudentId={selectedStudentId}
  records={records}
/>
```

---

## Business Rules

| Rule | Enforcement |
|---|---|
| Parent sees only their own children | `mockStudentGuardians[guardianId]` scopes student list; URL param validated against this list |
| Cross-guardian access blocked | If `searchParams.studentId` not in guardian's list → redirect to default |
| Read-only | No mutations, no server actions called from client |
| Empty state handled | `records.length === 0` renders "No attendance records yet" instead of an empty calendar |
| Calendar navigation is client-side | Only `displayedMonth` state changes; no server round-trips on prev/next |

---

## Constraints

- Student attendance data is sourced from Phase 3a mock sessions — Phase 3c does not add new session data
- Staff attendance (Phase 3b) is not visible to parents
- No date-range filter or term selector in this phase — all records are shown, calendar navigates by month
- No click-through to session detail — parent view is summary only
- HOD and Admin roles do not have a parent view page (out of scope)
