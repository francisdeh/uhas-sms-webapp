# Staff-as-Guardian + Staff-Children Filter — Design (Slice 3 of Phase 4 item 5, final)

Slice 1 built guardian↔student management; slice 2 added guardian logins + a parent co-guardian view. This is the final slice: let an admin mark a staff member as a student's guardian (staff have their own children at the school), and filter the admin students list to staff children.

## Problem

`Guardian` has no link to `Staff`. A staff member who is a parent has no way to appear as a guardian on their child's record — the only way to add a guardian is create-new (retyped, no relation to their staff identity) or link-existing.

## Decisions (from brainstorming)

- Picking a staff member **auto-fills** the create-new guardian form (name + phone from the staff record) but stays **editable**.
- **Phone only** is auto-filled; email is left blank — this avoids a real edge case: if the guardian record copied the staff member's own email, a later "Create login" (slice 2) for that guardian could collide with their existing staff-role Supabase auth account.
- The staff-children filter is a **server-side query param** on `GET /students`, mirroring the existing `division`/`activeOnly` precedent.
- If the auto-filled contact info collides with an *unrelated* pre-existing guardian record, **reject with a clear error** — no silent merge.
- **Out of scope, noted for later**: a "go to guardian portal" switcher for staff who are also guardians (recorded in `v2/UHAS_Migration_Execution_Plan.md` Phase 6 as strongly optional) — it needs a multi-role identity or session-exchange mechanism, a separate project. Also out of scope: a reverse "also a guardian of" view on the staff profile page (the extension point exists on `StaffDetail`'s tabs, not built here).

## Data model

Nullable `guardians.staff_id` → `staff.id`, indexed (FK + the filter-heavy column the new list filter uses). Migration chains off the current head `32cd865749cc`. One guardian identity per staff member is enforced **app-layer** (consistent with slices 1–2's max-two-guardians / one-login-per-guardian pattern, not a DB constraint): before creating a staff-tagged guardian, the service looks up any existing guardian with that `staff_id` in the school and reuses it. Multiple children of the same staff parent are handled by the existing `student_guardians` many-to-many link (same guardian row linked to multiple students — the same mechanism that makes siblings work).

## Guardian creation from a staff pick

`GuardianField` (slice 1) gains a third tab, **"From staff"** — a searchable staff picker (`useStaffList`, debounced, mirroring the existing "Existing guardian" search UI). On selecting a staff member, the frontend checks `GET /guardians?staffId=<id>`:

- **Found** → switches to **link mode**, pre-selected to the existing guardian (view-only, like today's "Existing guardian" flow).
- **Not found** → switches to **create mode**, pre-filling `firstName`/`lastName`/`phone` from the staff record (email left blank), tagging `staffId`. Every field stays editable.

`GuardianCreate` gains an optional `staff_id: UUID | None`. `GuardiansService.create`:
1. If `staff_id` is set, look up an existing guardian with that `staff_id` in the school (`GuardiansRepository.find_by_staff_id`) — if found, **return it** (idempotent reuse; guards a stale frontend check / race).
2. Otherwise validate the staff row exists in school, then proceed through the existing `find_by_email_or_phone` dedupe.
3. On a dedupe collision when `staff_id` is set, the conflict message is staff-specific: *"This staff member's contact info is already used by another guardian record — link that guardian manually, or resolve the conflicting record."*

`GET /guardians` gains an optional `staff_id` query filter (for the frontend's existence check) — `GuardiansRepository.list_for_school` conditionally filters `Guardian.staff_id == staff_id`.

## Staff-children filter

`GET /students` gains `staffChild: bool`. `StudentsRepository.list_for_school` conditionally joins `student_guardians` → `guardians` and filters `guardians.staff_id IS NOT NULL`, with `.distinct()` on both the rows and count queries (a student can have up to two staff-backed guardians, which would otherwise fan out the join — same pattern as `list_siblings`'s existing `.distinct()`). The admin students list gets a filter toggle alongside the existing division/status pills, wired into `useStudentsList`.

## Small additions

- `StudentGuardianRead` (the Guardian-tab read) gains `is_staff: bool` → a "Staff" badge next to Primary/Has-login on `GuardianTab`.
- No new audit action — reuses `GUARDIAN_LINKED` (slice 1's link-level event), consistent with auditing at the link, not the guardian-creation, level.

## Testing

**API**: create with `staff_id` tags the guardian; re-picking the same staff member reuses the existing guardian row (no duplicate); dedupe collision with an unrelated guardian → 409 with the staff-specific message; `GET /guardians?staffId=` returns the right row or empty; `staffChild=true` filters correctly with two staff-backed guardians on one student (no duplicate rows, correct count); `isStaff` reflected on `GET /students/{id}/guardians`.

**Web**: lint, tsc, Vitest, build, OpenAPI→TS drift.

## Out of scope (explicit)

- Guardian-portal switcher for staff-as-guardians (Phase 6, strongly optional).
- Reverse "also a guardian of" view on the staff profile page.
- Special handling for a staff-backed guardian's email later colliding with their staff login during "Create login" — Supabase's own conflict error surfaces normally; the phone-only default already avoids the common case.
