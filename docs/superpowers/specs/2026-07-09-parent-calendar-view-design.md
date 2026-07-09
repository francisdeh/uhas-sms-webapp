# Parent-Facing Published Calendar View — Design

Phase 4 backlog item: "Parent-facing published calendar view."

## Problem, as audited

The parent calendar route, hook, component, nav link, and backend read permission **already exist and work** — `GET /calendar` is already open to any authenticated role including Parent (already tested), and there's no draft/unpublished concept in the model at all: every event an Admin creates is immediately visible to every reader. So "published" in the backlog item's plain-English sense — parents can see events the school has put out — is already true.

Two real gaps remained, both frontend-only:
1. The calendar is a flat Upcoming/Past list, not visually distinguishing event types.
2. `school_terms` (term start/end dates) and `calendar_events` are two disconnected data sources — nothing shows a parent (or anyone else) when a term begins or ends, unless an Admin manually duplicates that as a `calendar_events` row (which nothing enforces or auto-syncs).

## Decisions (from brainstorming)

- No backend change — no migration, no new column, no new endpoint. This is a frontend-only feature.
- Keep the existing Upcoming/Past list (no month-grid rebuild — no reusable grid component or calendar library exists in this codebase; that would be a much larger, separate build).
- Merge in term start/end dates from `school_terms`, read-only, typed as `term_start`/`term_end` — types that **already exist** in `CalendarEventType` but nothing populates today.
- Apply the merge **everywhere `CalendarView` is used** (admin, teacher, deputy-head, parent), not just the parent page — via one shared helper, not duplicated per page.

## Implementation

**Shared merge helper** (new, e.g. `apps/web/src/features/reports/queries/get-calendar-with-terms.ts`): fetches `api.calendar.list()` and `api.schoolTerms.list()` (both already exist and are already read-open to every role), and for each term row synthesizes two read-only entries — "Term N begins" (`start_date`) and "Term N ends" (`end_date`), typed `term_start`/`term_end`. Merges with the real `calendar_events` list, sorted by date. No academic-year filtering (matches how `calendar_events` itself isn't year-filtered today — old terms land naturally in the Upcoming/Past split's "Past" section).

**Wiring**: all four calendar pages (`apps/web/src/app/(dashboard)/{admin,teacher,deputy-head,parent}/calendar/page.tsx`) call the shared helper instead of `api.calendar.list()` directly. `CalendarView` itself is otherwise unchanged — it already receives an `events` array and renders read-only unless `canManage` is passed (Admin only), so admin/teacher/deputy/parent all get the merged view while only Admin retains create/delete.

**Visual polish**: type-coded badges/icons per event type in `CalendarView`'s list rendering, so exams, holidays, one-off events, and now term boundaries are visually distinct. Exact colors/icons are decided against the current component during implementation, not pre-specified here.

## Testing

Frontend-only: lint, tsc, Vitest, build. No backend changes, so no new API tests; confirm the existing calendar test suite is untouched and still passes.

## Out of scope

- A real draft/publish toggle on `CalendarEvent` (confirmed not the intended meaning).
- A month-grid calendar visual (confirmed not wanted this pass — the list stays).
