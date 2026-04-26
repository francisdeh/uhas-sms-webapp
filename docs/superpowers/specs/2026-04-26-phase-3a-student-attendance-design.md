# Phase 3a — Student Attendance Design

**Date:** 2026-04-26
**Phase:** 3a (of 3a / 3b / 3c)
**Status:** Approved

---

## Overview

Class Teachers mark daily student attendance (present / absent / late) per class. Sessions are editable on the same day only. Admins can view and edit any session for any class on any date. Teachers can also view their past session history (read-only).

All data uses mock fixtures (`USE_MOCK_DATA=true`). No real DB integration in this phase.

---

## Routes

| Route | Role | Description |
|---|---|---|
| `/teacher/attendance` | Teacher | List of teacher's assigned classes with today's submission status |
| `/teacher/attendance/[classId]` | Teacher | Today's marking sheet + session history. `?date=YYYY-MM-DD` loads a past session read-only |
| `/admin/attendance` | Admin | Class + date picker |
| `/admin/attendance/[classId]?date=YYYY-MM-DD` | Admin | Editable attendance sheet for any class + date |

---

## File Structure

```
src/lib/mock/
  attendance.ts                       ← replace MockAttendanceSession/MockAttendanceRecord with proper types; 5 pre-seeded sessions

src/features/attendance/
  types.ts                            ← AttendanceStatus, AttendanceRecord, AttendanceSession, SessionWithRecords
  actions/index.ts                    ← 5 server actions (list + mutation, following students/actions pattern)
  components/
    AttendanceSheet.tsx               ← shared marking form (editable + read-only modes)
    TeacherClassList.tsx              ← teacher's classes with today's status badges
    SessionHistory.tsx                ← past sessions list with View links

src/app/(dashboard)/
  teacher/attendance/
    page.tsx                          ← Server Component → TeacherClassList
    [classId]/page.tsx                ← Server Component → AttendanceSheet + SessionHistory
  admin/attendance/
    page.tsx                          ← Server Component → AdminAttendancePicker
    [classId]/page.tsx                ← Server Component → AttendanceSheet (always editable)
```

---

## Data Model

### Types (`src/features/attendance/types.ts`)

```ts
export type AttendanceStatus = "present" | "absent" | "late";

export type AttendanceRecord = {
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  note?: string;
};

export type AttendanceSession = {
  id: string;
  schoolId: string;
  classId: string;
  date: string;         // "YYYY-MM-DD"
  term: number;
  submittedById: string;
  submittedAt: string;  // ISO timestamp
};

export type SessionWithRecords = AttendanceSession & {
  records: AttendanceRecord[];
};
```

### Mock Data (`src/lib/mock/attendance.ts`)

Replace existing `MockAttendanceSession` / `MockAttendanceRecord` types with the types above. Pre-seed 5 sessions:

| Session | Class | Date | Submitted by |
|---|---|---|---|
| session-jhs1a-2026-04-23 | class-jhs1a | 2026-04-23 | STAFF-005 |
| session-jhs1a-2026-04-24 | class-jhs1a | 2026-04-24 | STAFF-005 |
| session-jhs1a-2026-04-25 | class-jhs1a | 2026-04-25 | STAFF-005 |
| session-jhs2a-2026-04-25 | class-jhs2a | 2026-04-25 | STAFF-005 |
| session-p4-2026-04-25 | class-p4 | 2026-04-25 | STAFF-006 |

Each session includes records for all active students in that class (mix of present/absent/late statuses). Records use the format `{ sessionId, studentId, status, note? }`.

---

## Server Actions (`src/features/attendance/actions/index.ts`)

All actions start with `"use server"` and guard with `process.env.USE_MOCK_DATA === "true"`.

```ts
type ActionResult = { success: true } | { success: false; error: string };

// Get session + records for a class on a specific date. Returns null if none exists.
getSessionForClassDateAction(classId: string, date: string): Promise<SessionWithRecords | null>

// Create or overwrite a session for classId+date.
// Generates id `session-${classId}-${date}` on create; reuses existing id on overwrite.
// Replaces all records for that session.
saveSessionAction(input: {
  classId: string;
  date: string;
  term: number;
  records: { studentId: string; status: AttendanceStatus; note?: string }[];
}): Promise<{ success: true; sessionId: string } | { success: false; error: string }>

// List all sessions for a class, sorted newest first.
listSessionsForClassAction(classId: string): Promise<AttendanceSession[]>

// Attendance summary for a single student across all sessions.
getStudentAttendanceSummaryAction(studentId: string): Promise<{
  total: number; present: number; absent: number; late: number; pct: number;
}>

// Admin: list sessions across all classes, with optional filters.
listAllSessionsAction(filter?: {
  classId?: string; from?: string; to?: string;
}): Promise<AttendanceSession[]>
```

---

## Components

### AttendanceSheet

`"use client"`, shared between teacher and admin.

**Props:**
```ts
interface AttendanceSheetProps {
  classId: string;
  className: string;
  date: string;
  term: number;
  students: Student[];                 // active students in this class only
  existingSession: SessionWithRecords | null;
  editable: boolean;
}
```

**Behaviour:**
- Header: class name + formatted date ("Monday, 25 Apr 2026") + "Term {n}" badge
- If `!editable`: amber Alert banner — "This session is read-only. Only today's session can be edited."
- One row per student:
  - Left: Avatar (division-coloured gradient) + name + student ID (mono, text-xs)
  - Right: three toggle buttons — **Present** (active = green), **Absent** (active = red/destructive), **Late** (active = amber). Selecting one deselects the others.
  - Chevron expand icon → reveals a note text input (collapsed by default)
- Default state: pre-fill from `existingSession.records` if provided; otherwise all students default to **Present**
- Footer (only when `editable`):
  - Summary count: "{X} present · {Y} absent · {Z} late"
  - "Save session" Button with Loader2 spinner while pending
  - On success: `toast.success("Attendance saved.")` + `router.refresh()`
  - On error: `toast.error(result.error)`
- State: `records: Record<string, { status: AttendanceStatus; note?: string }>` keyed by studentId

### TeacherClassList

`"use client"`, props: `{ classes: SchoolClass[], todaySessions: Record<string, boolean>, listHref: string }`

- Header: "Attendance" h1 + today's date (formatted)
- Grid of class cards (one per assigned class):
  - Class name, division pill, student count
  - Status badge: **Submitted** (green) if `todaySessions[classId] === true`, else **Not yet marked** (amber)
  - Full card is a Link → `{listHref}/{classId}`
- Empty state: "You have no assigned classes." if `classes` is empty

### SessionHistory

`"use client"`, props: `{ sessions: AttendanceSession[], basePath: string }`

- Card: "Past Sessions" heading
- Table columns: Date (formatted), Term, View link → `{basePath}?date={session.date}`
- Sorted newest first
- Empty state: "No past sessions recorded."

### AdminAttendancePicker

`"use client"`, props: `{ classes: SchoolClass[] }`

- Header: "Attendance" h1 + "View or edit any class attendance session."
- Two side-by-side controls: Class Select (all classes, grouped by division) + Date `<input type="date">` (default today)
- "Open session" Button → `router.push(`/admin/attendance/${classId}?date=${date}`)` — disabled until both class and date are selected

---

## Page Implementations

### `/teacher/attendance/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `listClassesAction()` → filter to `c.classTeacherId === user.linkedId`
- `listAllSessionsAction({ from: today, to: today })` → build `todaySessions: Record<string, boolean>`
- Renders `<TeacherClassList classes={...} todaySessions={...} listHref="/teacher/attendance" />`

### `/teacher/attendance/[classId]/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `await params` → `classId`
- `searchParams.date` → `date` (falls back to today if absent)
- `editable = date === today`
- `getClassById(classId)` → `notFound()` if missing
- `listStudentsAction()` filtered to `classId` + `isActive === true`
- `getSessionForClassDateAction(classId, date)` → `existingSession`
- `listSessionsForClassAction(classId)` → `sessions`
- Renders:
  ```tsx
  <AttendanceSheet date={date} editable={editable} students={students} existingSession={existingSession} ... />
  <SessionHistory sessions={sessions} basePath={`/teacher/attendance/${classId}`} />
  ```

### `/admin/attendance/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `listClassesAction()` → all classes
- Renders `<AdminAttendancePicker classes={...} />`

### `/admin/attendance/[classId]/page.tsx` (Server Component)
- `getSessionUser()` → `redirect("/login")` if null
- `await params` → `classId`; `searchParams.date ?? today` → `date`
- `getClassById(classId)` → `notFound()` if missing
- `listStudentsAction()` filtered to `classId` + `isActive === true`
- `getSessionForClassDateAction(classId, date)` → `existingSession`
- Renders `<AttendanceSheet date={date} editable={true} ... />`
- Includes a back link to `/admin/attendance`

---

## Business Rules

| Rule | Enforcement |
|---|---|
| Teacher can only edit today's session | `editable = date === today` in teacher page; amber read-only banner shown |
| Admin can edit any date | Admin page always passes `editable={true}` |
| `saveSessionAction` creates or overwrites | Session ID is deterministic: `session-${classId}-${date}` |
| Only active students shown on sheet | `listStudentsAction` filtered to `isActive === true` |
| Default status is Present | When no existing session, all records initialise to `"present"` |

---

## Constraints

- No real-time sync — `router.refresh()` after save is sufficient
- No partial saves — entire session saved at once via `saveSessionAction`
- No delete session — sessions are permanent once saved (Admin can overwrite)
- Staff attendance and leave requests are Phase 3b (out of scope here)
- Parent view is Phase 3c (out of scope here)
