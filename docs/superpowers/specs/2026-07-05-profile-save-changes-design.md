# Profile page completion — Save Changes (Profile tab) — design

**Date:** 2026-07-05
**Phase:** 3.5 — Platform completion & admin polish (Profile page completion, first sub-feature)
**Status:** Approved, ready for implementation

## Context

"Profile page completion" is not one project — `apps/web/src/features/profile/components/ProfilePage.tsx` bundles five largely-independent mocked features under one page: Save Changes (Profile tab), 2FA/TOTP, Active Sessions, Notification preferences, and self-service account deactivation. Each needs its own backend concept and ships independently. This design covers only the first, smallest piece: **Save Changes**.

There's a pre-migration spec for this whole area (`docs/implementation-spec.md` §"Next up — Profile page completion") describing the same feature-level gaps, but its implementation mechanics (Firebase MFA, Next.js Server Actions like `updateMyProfileAction`) predate the Strategy A migration and no longer apply — this design re-derives the mechanics against the current FastAPI + Supabase architecture. The feature-level punch list itself is still accurate.

Current state (`ProfileTab` in `ProfilePage.tsx`): photo upload is real (`api.staff.update(...)`). The "Save Changes" button's `onSubmit` is `await new Promise(r => setTimeout(r, 600)); console.log(...); toast.success(...)` — no API call, nothing persisted. The form has three fields: `displayName`, `phone`, `language`.

## Goals

- Display name and phone edits from the Profile tab actually persist and survive a reload.
- Works identically for staff (Admin/DeputyHead/Teacher) and Parents — both have a linked row (`staff` or `guardians`) with `first_name`/`last_name`/`phone` columns already.
- Consistent with the existing admin-side update path (`UsersService.update`) — same name-splitting logic, same Supabase `user_metadata` sync — so the two paths don't silently drift.

## Non-goals

- The other four Profile-page sub-features (2FA, Active Sessions, Notifications, Deactivation) — separate designs.
- The Language dropdown — removed from the form entirely in this PR. There's no i18n system anywhere in this app yet; persisting a value nothing reads would be dishonest UI. Re-add it, backed by real storage, once i18n exists or once the Notification-preferences work builds a `user_preferences` table it could piggyback on.

## Architecture

### Backend

New `PATCH /me` endpoint, alongside the existing `GET /me` (`apps/api/app/features/me/router.py`):

- New `MeUpdate` schema (`apps/api/app/features/me/schema.py`): `display_name: str | None`, `phone: str | None` — both optional, partial update (`model_dump(exclude_unset=True)`, matching `UserUpdate`'s convention).
- `MeService.update(session, user, payload, *, supabase)`:
  1. Requires `user.linked_id` — if absent, raise `ValidationError("No linked staff/guardian record to update.")`. Nothing to write to otherwise.
  2. Loads the linked `Staff` row (or `Guardian` for `PARENT` role) by `linked_id`.
  3. If `display_name` provided: split via `first, _, last = display_name.partition(" ")` (identical to `UsersService._apply_display_name`), write `first_name`/`last_name` on the linked row.
  4. If `phone` provided: write directly to the linked row's `phone` column (already exists on both `Staff` and `Guardian`).
  5. If `display_name` was provided, also call `supabase.update_user_by_id(user_id, user_metadata={"display_name": display_name})` — mirrors `UsersService.update`'s existing sync, so `user_metadata.display_name` doesn't drift from the DB row for anywhere that reads the JWT directly instead of calling `/me` fresh. Reuses the existing `SupabaseAdminClient` DI seam (`get_supabase_admin_client`), same fake-injection pattern already used in the `users` test suite.
  6. Returns `MeService.get(session, user)` — same composite shape `GET /me` already returns, so the frontend's existing session-refresh handling doesn't need a new response shape.
- If the Supabase sync fails, the whole request fails (no try/except swallowing it) — matches `UsersService.update`'s existing behavior; better to surface a clear error than leave the DB and Supabase's `user_metadata` inconsistent.

### Frontend

`ProfileTab.onSubmit` (`ProfilePage.tsx`) calls `api.me.update({ displayName, phone })` instead of the fake `setTimeout`, then `router.refresh()` (matching the photo-upload handler already in the same component) so the sidebar/header display name updates immediately. On failure, `toast.error(err instanceof ApiError ? err.message : "Failed to update profile.")` — the standard pattern used everywhere else in this codebase.

The Language `Field` block (the `Select` + its `useState`) is deleted from `ProfileTab`. `profileSchema`/`ProfileValues` (wherever those are defined — likely colocated in this file or `features/profile/types.ts`) drop the `language` field.

## Error handling

- No `linked_id` on the caller → `ValidationError` (400), surfaced as a toast. Shouldn't normally happen (every real account has one by the time they can reach this page) but is a real possible state during account provisioning.
- Linked row not found (defensive — `linked_id` pointing at a deleted row) → `NotFoundError` (404).
- `guardians.phone` has a `unique=True` constraint (`Staff.phone` doesn't) — a Parent setting a number that collides with another guardian's raises an `IntegrityError` on flush. Caught and mapped to `ConflictError` (409) with a clear message, rather than surfacing as a raw 500.
- Supabase sync failure → propagates as-is (503 `ServiceUnavailableError` if Supabase isn't configured, matching every other admin-client caller).

## Testing

**Backend** (`apps/api/app/features/me/tests/test_router.py`, extending the existing file):
- Staff (Admin/Teacher/DeputyHead) updates `displayName` + `phone` → row's `first_name`/`last_name`/`phone` reflect it, `GET /me` afterward shows the new `displayName`.
- Parent (guardian-linked) updates the same fields → writes to `guardians`, not `staff`.
- Partial update (`phone` only) doesn't touch `display_name`/the linked row's name fields.
- No `linked_id` on the caller → 400.
- Parent setting a phone number that collides with another guardian's → 409, not a raw 500.
- Supabase `user_metadata` sync is asserted via the existing `FakeSupabaseAdminClient` pattern (`users` test suite's convention) — assert `update_user_by_id` was called with the new `display_name`.
- 401 unauthenticated.

**Frontend**: no new test — matches the "Skip it, rely on backend tests + manual check" precedent already established for `ReportCardPage`'s Download button (no component-testing infra exists in this repo).

## Open questions

None outstanding — scope (this sub-feature only), the language-field removal, and the update mechanics were all explicitly decided during brainstorming.
