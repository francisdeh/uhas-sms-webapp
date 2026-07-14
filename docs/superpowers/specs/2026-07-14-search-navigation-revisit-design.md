# Search navigation revisit — design

Backlog item from `v2/UHAS_Migration_Execution_Plan.md` Phase 6 item 11's remaining-backlog list — one of the items the user originally flagged directly, with no further detail beyond the name. Scoped via a full audit of the global search/command-palette feature.

## Pre-design audit — ground truth

- The feature is `apps/web/src/features/shell/components/SearchCommand.tsx`, a `cmdk`-based `⌘K` command palette, backed by a real FastAPI endpoint (`GET /search`, `apps/api/app/features/search/{router,service,repository,schema}.py`) — not a client-side-only static list. It's a hybrid: page-nav entries come from `role-config.ts` (so they can't drift from the sidebar, by construction), and student/staff/class entities come from a real, role-scoped server query.
- **Dead code**: the palette has a fully-built "Announcements" results group (render branch, type field) that is hardcoded to `[]` client-side, with no backing field on the backend schema at all. No prior doc ever specified announcements as intended scope — this is unfinished scaffolding, not a regression.
- **Real navigation bug**: search results don't always land where their label implies. Backend `SearchService` correctly returns role-scoped hits (e.g. staff hits to DeputyHead, student hits to Teacher/Parent), but `SearchCommand.tsx`'s href-building logic only has real per-role branches for some combinations. The rest fall back to the role's plain dashboard root or a list page.
- Investigating *why* those hrefs were missing surfaced that for several (role, entity) pairs, **no detail page exists at all** — not just a missing link:
  - **Parent → student**: pure href bug. `/parent/children/[id]` already exists; the palette just links to the list instead.
  - **DeputyHead → staff**: no `/deputy-head/staff` page exists anywhere. Backend already permits it (`GET /staff/{id}` has no role gate), but there's zero staff-facing UI for this role beyond a decorative, unclickable "Staff in Division" list on their dashboard.
  - **Teacher → student**: no student-facing route exists under `/teacher/` at all. Backend already scopes `GET /students/{id}/medical` to let a class-teacher or subject-teacher read blood type, medical notes, and emergency contacts — but no Teacher-facing page surfaces any of it.
  - **Admin/DeputyHead → lesson plans, schemes**: **not actually gaps** — both roles already have full review mechanisms (`ReviewQueue`, `AdminSchemeReview`, expand-in-place cards with Approve/Reject/Acknowledge). There's just no per-item URL to deep-link a search hit to, since these are list pages, not `[id]` routes. (One real, separate, out-of-scope finding along the way: Admin's lesson-plan view is deliberately read-only, and CLAUDE.md's "Admin if escalated" chain has no "escalated" state anywhere in the data model — a genuine gap, but an escalation-workflow feature, not a search-nav fix. Not touched in this PR.)
- Two backend permission checks currently block content the two new pages need: `_assert_can_view_student` (gates guardians/documents/siblings) is Admin/DeputyHead-only — Teacher isn't included, unlike the medical-info check, which already allows class-teacher-or-subject-teacher. `StaffService.list_documents` is Admin-or-self only — DeputyHead isn't included.
- `StudentDetail.tsx` is already a shared, prop-driven component across Admin and DeputyHead (`basePath` prop selects which sections/buttons show) — a third case is a natural extension. `StaffDetail.tsx` has no such pattern yet — every mutation button (Edit, Deactivate, Change Role) is unconditional, so a read-only DeputyHead variant needs a real new prop, not just a branch.

## Scope (decided)

One PR, five pieces:

1. Remove the dead Announcements search branch. Fix Parent's student-hit href (pure bug — destination already exists).
2. Two backend permission widenings (both additive, no existing access narrowed): Teacher gains guardians/documents/siblings access for students in classes they class-teach or subject-teach (mirrors the existing medical-info check exactly); DeputyHead gains staff-documents access for staff in their own division.
3. New page: Teacher student profile (`/teacher/students/[id]`), reusing `StudentDetail` with a new `basePath` case — read-only via an explicit `canEdit` prop (not the existing stringly-typed `isAdmin` check), tabs: Profile, Academic (no Report Cards), Contact, Guardian, Health & Docs. Also wired into Teacher's class roster / attendance views as a natural entry point, not just search.
4. New page: DeputyHead staff profile (`/deputy-head/staff/[id]`), extending `StaffDetail` with a new `readOnly` prop — no Edit/Deactivate/Change Role, tabs: Profile, Qualifications (subject expertise, qualifications, documents). Also wired into the DeputyHead dashboard's currently-decorative "Staff in Division" list, making those rows real links.
5. Search expansion: fee items (Accountant, school-wide) and lesson plans + schemes (Teacher/DeputyHead/Admin, same scoping their list endpoints already use), plus wiring every (role, entity-type) href in `SearchCommand.tsx` to a real destination now that one exists for each.

## 1. Quick fixes

- `SearchCommand.tsx`: delete the Announcements render branch; remove the corresponding `announcements` field from `GlobalSearchResults` (`shell/types.ts`) and the hardcoded `announcements: []` in the fetch call.
- `studentHref` for Parent: change from `/parent/children` to `` `/parent/children/${id}` ``.

## 2. Backend permission changes

- `apps/api/app/features/students/service.py`: `_assert_can_view_student` gains the same class-teacher-or-subject-teacher check `_assert_can_view_medical` already has for Teacher. Used by the guardians, documents, and siblings endpoints.
- `apps/api/app/features/staff/service.py`: `StaffService.list_documents`'s permission check gains a DeputyHead branch — allowed when the target staff member's `division` matches the caller's own division (same division-resolution pattern `ClassesService._deputy_division` uses).
- Both changes are pure widenings — existing Admin/self/Parent/DeputyHead(-own-division-elsewhere) access is untouched.

## 3. Teacher student profile page

- New route `apps/web/src/app/(dashboard)/teacher/students/[id]/page.tsx`. Server Component: fetch the student via `getApi()`, 404 if not found; no extra division/class guard needed client-side since the backend endpoints themselves now enforce class-teach-or-subject-teach (a Teacher requesting a student outside their classes gets a real 403 from the guardians/documents/medical calls — `StudentDetail` should treat that as "tab unavailable," not crash the page, same as any other tab-level fetch failure).
- `StudentDetail.tsx` gains a third `basePath` case (`"/teacher/students"`) and switches its internal `isAdmin`-style booleans to explicit `canEdit`/`canViewReportCards` props, both `false` for the Teacher case (and `true`/`true` for Admin, `false`/`false` for DeputyHead — preserving DeputyHead's current behavior exactly, since fixing DeputyHead's existing over-broad Edit/Transfer visibility is a separate, out-of-scope cleanup).
- Entry points: search results (below), plus a new clickable row in the Teacher's class roster (attendance page's student list) linking to this route.

## 4. DeputyHead staff profile page

- New route `apps/web/src/app/(dashboard)/deputy-head/staff/[id]/page.tsx` — Server Component, 404 if the fetched staff member's `division` doesn't match the caller's own (same guard pattern the existing DeputyHead student-detail page already uses).
- `StaffDetail.tsx` gains a `readOnly` prop (default `false`, preserving Admin's page unchanged): when `true`, hides Edit Info / Deactivate-Reactivate / Change Role and the Access tab entirely; Qualifications tab (subject expertise, qualifications, documents) stays visible, now backed by §2's permission change.
- Entry points: search results (below), plus making the DeputyHead dashboard's "Staff in Division" list (`DashboardOverview.tsx`) real links instead of decorative rows.

## 5. Search expansion + href wiring

- **Fee items**: `FeeItemsRepository.list` (or equivalent) gains a `q` param, case-insensitive match on `name` — same shape as the existing student/staff/class queries in `search/repository.py`. `SearchService`'s Accountant branch (currently `_empty()`) returns fee-item hits, school-wide. `SearchCommand.tsx` renders a new "Fee Items" group, href → `/accountant/fee-items/{id}` (existing page).
- **Lesson plans**: `LessonPlansRepository.list_for_school` gains a `q` param matching `topic`. `SearchService` adds lesson-plan hits scoped exactly like the existing `GET /lesson-plans` list endpoint (Teacher forced to their own `teacher_id`; DeputyHead to their division; Admin unrestricted).
- **Schemes**: same shape, matching `title`, same per-role scoping as the existing schemes list endpoint.
- **Destination hrefs**:
  - Teacher lesson-plan hit → `` `/teacher/lesson-plans/${id}` `` (existing page, direct link).
  - DeputyHead/Admin lesson-plan hit → `` `/deputy-head/lesson-plans?focus=${id}` `` / `` `/admin/lesson-plans?focus=${id}` ``. `ReviewQueue`/`LessonPlansOversight` read `?focus=` on mount, auto-expand the matching card, and scroll it into view.
  - DeputyHead/Admin scheme hit → same `?focus=` pattern against `/deputy-head/schemes` / `/admin/schemes`, read by `AdminSchemeReview`.
  - Teacher student hit → `` `/teacher/students/${id}` `` (new page from §3).
  - DeputyHead staff hit → `` `/deputy-head/staff/${id}` `` (new page from §4).
  - Parent student hit → `` `/parent/children/${id}` `` (fixed in §1).
  - Every existing correct href (Admin student/staff/class, DeputyHead student/class) is untouched.

## Testing

- Backend: pytest for both permission widenings — Teacher can now fetch guardians/documents/siblings for a student in a class they teach, still 403 for one they don't; DeputyHead can now fetch staff documents within their division, still 403 outside it. New pytest coverage for the 3 search domains — role-scoping matches each domain's existing list-endpoint scoping exactly, `q` filters correctly, empty/no-match cases.
- Frontend: manual browser check per role — every entity type's search hit lands on a real, correct page (no more silent dashboard-root fallbacks); the two new profile pages render with the right tabs and no edit affordances; `?focus=` auto-expand works on both `ReviewQueue` and `AdminSchemeReview`; the new roster/dashboard entry points to the two new pages work. No new Vitest component tests, consistent with this codebase's existing convention.

## Out of scope

- Building an "escalated" state for the lesson-plan approval chain, or any Admin-side approve/reject capability — a real gap found along the way, but a distinct, larger feature (data model + workflow changes), not a search-nav fix.
- Fixing DeputyHead's existing over-broad Edit/Transfer-Class button visibility on the shared `StudentDetail` component — pre-existing behavior, unrelated to this work; the new Teacher case is built correctly from scratch instead.
- Any change to Admin's student/staff/class search behavior, hrefs, or destination pages — all already correct.
- A dedicated "focus"/deep-link mechanism for anything beyond lesson plans and schemes (e.g. no equivalent is needed for fee items, since that destination is already a real `[id]` route).
