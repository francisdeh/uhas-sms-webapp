# Audit backlog PR 1: dead-code cleanup + missing edit UIs

**Status:** Approved, ready to implement.

## Context

Follow-up to the pre-go-live gap audit's tier-1 cleanup. Three parallel research agents swept the codebase for unwired enum values, backend endpoints with no frontend consumer, and response fields the frontend drops. The user chose to split the resulting backlog into two PRs; this is the first — dead-code cleanup plus the four domains that are create-only despite the backend already supporting edit.

## Cluster A — Dead-code cleanup

Six backend routes confirmed to have zero frontend callers (grepped across all of `apps/web/src`, re-verify with a fresh grep immediately before each deletion — same standard the tier-1 cleanup PR used):

1. **Standalone guardian create/fetch** — `POST /guardians`, `GET /guardians/{guardian_id}` only (`apps/api/app/features/guardians/router.py`). Superseded by the student-scoped `POST /students/{id}/guardians` flow (`GuardianField.tsx`). `GET /guardians` (list), `GET /guardians/{id}/children`, and `POST /guardians/{id}/login` all have real callers and stay. **`PATCH /guardians/{guardian_id}` also re-verified as having zero callers, but turned out NOT to be dead code** — its service method already contains real, working Admin-edit-with-Supabase-sync logic, and there is genuinely no UI anywhere to edit an existing guardian's contact info. Moved to Cluster B as a 5th edit dialog instead of being deleted.
2. **`GET /students/{student_id}/guardian`** (singular, `students/router.py:119-125`) — superseded by the plural `students.guardians(id)` used in 3+ places.
3. **`GET /enrollments/{enrollment_id}`** (`enrollments/router.py:74`) — no standalone caller; all roster views use student/class-scoped list endpoints.
4. **`GET /fees/learner-fees/{learner_fee_id}`** (`fees/router.py:280-284`) — superseded by `listLearnerFees`/`listLearnerFeesForItem`.
5. ~~`POST /notifications/mark-read`~~ — **also NOT dead code.** Re-verified as having zero callers, but the reason is a real UX bug, not redundancy: `NotificationsDropdown.tsx` auto-marks *every* unread notification read the instant the dropdown opens (before anything is actually read), which is why per-item mark-read was never called — there was nothing left unread to mark individually by the time a click could happen. Fixed instead: removed the mark-all-on-open behavior; clicking a notification now marks just that one read via the previously-unused endpoint. The explicit "Mark all as read" button stays as the only bulk path. No backend changes — the endpoint was already correct, just uncalled.
   - **Follow-on bug found during manual verification**: the "Mark all as read" button itself didn't work — clicking it never persisted (confirmed via direct DB inspection: the row stayed `read_at = NULL` after clicking, both immediately and after a reload). Root cause: this codebase's `DropdownMenuItem` wraps **Base UI's** `Menu.Item` (`@base-ui/react/menu`), not Radix — its shipped type definitions expose `onClick`, not `onSelect`. The button was wired with `onSelect={(e) => { e.preventDefault(); markAll.mutate(); }}`, a Radix-shaped handler Base UI's `Menu.Item` never invokes, so the mutation silently never fired. Pre-existing bug, not introduced by this PR's changes to the file (confirmed via `git diff` — this handler was untouched by the mark-all-on-open fix above). Fixed to a plain `onClick={() => markAll.mutate()}`, matching the already-working per-item pattern in the same file.
6. ~~The by-subject mode of `GET /class-subjects`~~ — **left alone.** Unlike the other 5 items this isn't a separate route: it's one shared endpoint with an XOR `subjectId`/`teacherId` param and role-gating logic that treats both modes as intentional. Only `teacherId` has a frontend caller, but removing `subjectId` means surgically stripping one branch out of a shared, tested, working endpoint rather than a clean route deletion — not worth the added risk for an unused-but-harmless capability. Logged as "unbuilt, not dead" backlog instead of touched here.

For each: delete the router endpoint(s), the corresponding `client.ts` method(s), any now-fully-unused hook, and the route's backend tests. Delete a service/repository method or Pydantic schema only if it is *exclusively* used by the deleted route (re-verify with grep — anything shared with a surviving route stays). Regenerate `api.d.ts` after the backend changes land.

## Cluster B — Missing edit UIs

Four domains have a working `PATCH` endpoint and an already-written, already-unused frontend hook, but no edit affordance in the UI. New edit dialogs follow the existing `StaffDetail.tsx` "Edit Info" dialog pattern: shadcn `Dialog` + `react-hook-form` + `zodResolver`, `ApiError`/`toast.error` on failure, `router.refresh()` + `toast.success()` on success (Server Component list/detail pages re-fetch on refresh, matching `StaffDetail`/`StudentDetail`'s existing mutation pattern — no manual `invalidateQueries` needed for these Server Component-rendered pages).

Field sets are dictated by each domain's own backend `*Update` schema, not chosen freely — verified directly against `apps/api/app/features/*/schema.py`:

| Domain | Edit dialog fields | Immutable (omit from edit) | Notes |
|---|---|---|---|
| Exam | name, type, term, academicYear | — (all 4 create fields are PATCHable) | Edit button disabled once `exam.isPublished` — matches the backend's "unpublished only" partial-update constraint |
| Class | name, division | academicYear, slug | Both immutable fields are absent from `ClassUpdate` |
| Fee Item | name, amount, isActive (new toggle) | scope, scopeRef, academicYear, term | Immutable fields define the fee's identity/target roster; `isActive` exists in `FeeItemUpdate` but has no create-form equivalent |
| Subject | name, division, category | slug | Canonical code, immutable after creation |
| Guardian | firstName, lastName, phone, email | slug, staffId | Wired to the already-existing `GuardiansService.update` (Admin-only, syncs phone/email to Supabase Auth). New "Edit contact info" button on `GuardianTab.tsx`, gated behind the existing `canEdit` prop (Teacher's read-only student view must not see it either) |

**Drive-by fix (approved):** `SubjectCategory` has 3 backend values (`Core`/`Elective`/`Optional`) but the create form's `<Select>` only offers 2. Since the edit dialog needs the same category picker, add the missing `Optional` `<SelectItem>` to both the create form and the new edit dialog in the same pass.

## Testing

- Backend: new pytest for each deleted route confirms it now 404s (or remove the test file entirely if the whole router file is deleted); existing PATCH endpoint tests for exams/classes/fee-items/subjects already exist and don't need new coverage, just confirmation the new frontend dialogs call them correctly.
- Frontend: manual browser verification per edited domain — open each new edit dialog, change a field, save, confirm the list/detail view reflects it; confirm the Exam edit button is disabled/hidden once published; confirm Subject's category picker now offers all 3 values in both create and edit.
- Full verification suite: backend `ruff check`/`ruff format --check`/`mypy`/`pytest`; frontend `tsc --noEmit`/`pnpm lint`/`pnpm test`/`pnpm build`; regenerate `api.d.ts` and diff it if the OpenAPI schema changed (route deletions will remove schema entries).

## Out of scope (deferred to PR 2 or backlog)

- Promotions review data reuse (class-teacher names, student photos, chase-list, JHS3 Withdraw) — PR 2.
- Attendance Excused/Late status end-to-end — PR 2.
- The SMS log page (`GET /sms-log` has zero frontend surface) — separate backlog item, not bundled here.
