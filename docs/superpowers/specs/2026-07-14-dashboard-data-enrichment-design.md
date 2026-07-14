# Dashboard data enrichment/validation — design

Backlog item from `v2/UHAS_Migration_Execution_Plan.md` Phase 6 item 11's remaining-backlog list — one of the items the user originally flagged directly, with no further detail beyond the name. Scoped via a full audit of all four role dashboards (Admin, DeputyHead, Teacher, Parent) rather than guessing at intent.

## Pre-design audit — ground truth

- No prior doc names "dashboard enrichment/validation" specifically. `docs/implementation-spec.md:214` specifies the Admin dashboard should show "total students, today's attendance rate, pending lesson plan approvals, recent announcements" — the last two are computed by the backend today but never reach the Overview page. This is very likely the real substance of the original ask.
- **A real, currently-shipping bug**: `apps/api/app/features/reports/repository.py:51` defines `_ATTENDANCE_AT_SCHOOL = {"present", "late"}` (lowercase), but attendance records are stored capitalized (`AttendanceStatus = Literal["Present", "Absent", "Late", "Excused"]`, `attendance/constants.py:16`) in a plain `varchar` column (no DB enum). Postgres string comparison is case-sensitive, so every "last 7 days attendance" computation via `attendance_counts_for_day` silently returns 0/total — affecting `/admin/reports`, `/deputy-head/reports`, `/teacher/reports`, and (once wired in below) the Deputy Head dashboard. No existing test seeds/asserts a real attendance status through this path, which is how it shipped unnoticed.
- All 4 dashboards follow the same "Overview page" structure: a Server Component `page.tsx` fetches data and passes props to a client `DashboardOverview.tsx` that renders stat cards + panels.
- Admin (`ReportsService.get_school_stats`) and Deputy Head (`ReportsService.get_division_stats`) both already compute richer data than their Overview pages consume — `lessonPlans` counts and (Deputy Head only) `attendanceLast7` are fetched and then discarded before reaching the stat cards.
- Teacher's Overview (`teacher/page.tsx:20-23`) and the separate `/teacher/classes` page both work around a real gap — there's no way to ask "which classes does this teacher class-teach" in one query, so both pages fan out `api.classes.teachers.list(c.id)` once per class in the *entire school* and filter client-side for a match (explicitly acknowledged in a code comment: "There's no direct API to list classes I class-teach today").
- Teacher's "Lesson Plans" stat card is a literal placeholder: `value: null`, static `trend: "Create & submit"`, hardcoded `"My Plans →"` text — despite `GET /lesson-plans` already supporting a `teacherId` filter.
- Deputy Head's "Staff Attendance" card collapses a real session (which the page already fetches in full, including every staff member's per-record status) into a boolean ("submitted today: yes/no").
- Parent's "Announcements" stat shows `announcements.length` where `announcements` is capped at `size: 4` — the response's real `total` field is fetched and discarded. Any school with 4+ announcements ever shows a permanent, wrong "4".
- Parent's attendance percentage is computed only for `linkedChildren[0]` — a parent with multiple children gets one undifferentiated number with no indication which child it belongs to.
- Parent's attendance percentage counts only `status === "present"` (strict) while every other dashboard's "at school" definition includes `"late"` too — a definitional inconsistency, not a bug (this endpoint, `get_student_calendar`, already correctly translates DB status to a lowercase wire format via `_DB_STATUS_TO_WIRE`, so this is not the same casing bug as above).

## Scope (decided)

Fix the bug, then enrich all four dashboards with real data already computed or cheaply computable — not just cosmetic fixes. One small backend addition (a `classTeacherId` filter on `GET /classes`) is in scope for the Teacher dashboard; no other new backend endpoints are needed anywhere else. `/teacher/classes`'s identical N+1 pattern is explicitly **not** touched in this PR (see Out of scope).

## 1. Bug fix: attendance status casing

`apps/api/app/features/reports/repository.py`: change `_ATTENDANCE_AT_SCHOOL = {"present", "late"}` to `{"Present", "Late"}`. Add a regression test in `apps/api/app/features/reports/tests/` that seeds real `AttendanceRecord` rows with capitalized statuses and asserts `attendance_counts_for_day` returns a non-zero present count — the current test suite has no such assertion anywhere.

## 2. Admin dashboard

- **Two new stat cards**, sourced from `SchoolStats` fields already fetched by `admin/page.tsx` but currently unused: "Today's Attendance" (`todayAttendance.sessionsRecorded`/`todayAttendance.classes`, e.g. "8/11 classes recorded") and "Pending Lesson Plans" (`lessonPlans.submitted + lessonPlans.unitHeadApproved`).
- Grid changes from 4 cards (`grid-cols-2 lg:grid-cols-4`) to 6 (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`).
- **Fix 3 hardcoded trend strings** in `admin/page.tsx`'s `statCards` array, each replaced with a real value already available in `SchoolStats.totals`:
  - Total Students: `"+3 this term"` → `` `${activeStudents}/${students} active` ``
  - Total Staff: `"Fully staffed"` → `` `${activeStaff}/${staff} active` ``
  - Active Classes: `` `${currentYear} · KG · Primary · JHS` `` (redundant with the division-breakdown panel directly below it) → `` `${subjects} subjects` ``

## 3. Deputy Head dashboard

- **"Staff Attendance" card**: `deputy-head/page.tsx` already fetches the full `todayStaffSession` (including every `records[].status`) but only passes a boolean (`staffAttendanceToday: todayStaffSession !== null`) to the Overview. Change to pass real counts — `presentCount` (statuses in `{"Present", "Late"}`, matching the app-wide "at school" definition) over `total` (`records.length`) — computed from data already in hand, no new fetch.
- **Fix the hardcoded "Active members" trend** on the Staff card, replaced with a real computed value from the same staff list already fetched (e.g. active-staff fraction).
- **Add a "Pending Lesson Plans" stat card**, division-scoped, sourced from `DivisionStats.lessonPlans` (already fetched by `get_division_stats`, currently discarded) — same `submitted + approved`-in-flight framing as Admin's (Deputy Head's `DivisionLessonPlanCounts` collapses `unit_head_approved` into `approved` already, per its own docstring, so this is just `lessonPlans.submitted`).

## 4. Teacher dashboard

- **New backend filter**: `GET /classes` gains an optional `classTeacherId` query param — repository joins `class_teachers`, filters by `staff_id`. Used only by `teacher/page.tsx`, replacing its N+1 fan-out (`api.classes.teachers.list(c.id)` per class in the whole school) with one filtered list call.
- **"Lesson Plans" card**: replace the placeholder (`value: null`, static text, hardcoded link label) with real data from `GET /lesson-plans?teacherId=...` (already supports this filter) — value = pending count (`draft + submitted`), trend = `` `${rejectedCount} rejected` `` when non-zero, else `"All caught up"`.

## 5. Parent dashboard

- **Announcements stat**: use `announcementsPage.total` (already returned, currently discarded) for the stat card's value instead of the capped `announcements.length`; the "recent" list underneath continues to show only 4.
- **Multi-child attendance**: compute attendance % for every linked child (not just `linkedChildren[0]`) via the same `studentViews.attendanceCalendar` call per child (small N, 1-3 typical). When there's more than one child, show the average across all children, with the trend text changing from `"View record"` to `` `Avg across ${n} children` `` so it's clear the number is an aggregate, not silently picking one child.
- **Align the "at school" definition**: change `r.status === "present"` to also count `"late"`, matching the same `_ATTENDANCE_AT_SCHOOL` concept used everywhere else in the app, so "attendance %" means the same thing on every dashboard.

## Testing

- Backend: new regression test for the casing bug fix (§1); new/updated pytest coverage for the `classTeacherId` filter on `GET /classes` (§4) — filters correctly, returns empty for a teacher with no class-teacher assignments, school-scoped.
- Frontend: `tsc`/lint/Vitest/build all clean. Manual browser check across all 4 roles with real seeded/recorded data: confirm each new/fixed stat card shows a real, non-fake number; confirm the Teacher Overview no longer does the N+1 fan-out (spot-check via fewer network calls or reasoning about the code path); confirm a multi-child parent account shows the averaged attendance % with the right trend text. No new Vitest component tests, consistent with this codebase's existing convention.

## Out of scope

- `/teacher/classes`'s identical N+1 class-teacher-lookup pattern — shares the root cause the new `classTeacherId` filter fixes, but touching that page is a separate, later cleanup, not part of this dashboards-focused PR.
- Any change to `/admin/reports`, `/deputy-head/reports`, `/teacher/reports` beyond the casing bug fix that incidentally un-breaks their existing attendance charts — no new reports-page features here.
- A dedicated Parent-facing stats endpoint (Parent's Overview stays hand-assembled from existing list/detail calls, same as today) — not needed for the fixes above.
- Historical/trend deltas (e.g. "+3 this term" as a *real* week-over-week change) — no snapshot/history table exists to compute this from; every "trend" fix above uses a real *current* value instead, not a real delta.
