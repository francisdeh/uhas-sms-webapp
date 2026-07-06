# Self-service account deactivation — design

**Date:** 2026-07-06
**Phase:** 3.5 — Platform completion & admin polish (Profile page completion, final sub-feature)
**Status:** Approved, ready for implementation

## Context

The shared Profile page's `DangerTab` (`apps/web/src/features/profile/components/ProfilePage.tsx`) is a UI-only stub: its "Deactivate" button just fires `toast.success("Deactivation request sent to administrator.")` — no API call, no effect. This wires it to a real self-service deactivation.

Admin-side deactivation already exists and is the reference implementation. `POST /users/{id}/deactivate` (Admin-only) calls `UsersService.set_active(active=False)`, which does **both**:
- flips the `users.is_active` bridge-row column, and
- bans the Supabase Auth user via the admin API (`ban_duration="876600h"`, a ~100-year ban; reactivation sends `"none"`).

**Critical finding from the audit:** enforcement of an inactive account runs *entirely* on the Supabase ban. Nothing in `proxy.ts`, `core/security.py`, or `core/deps.py` ever checks `is_active` — a banned Supabase user simply can't log in or refresh a token. So self-deactivation **must** perform the real ban, not merely flip the DB column, or the user would keep working until their token expired.

Reactivation is admin-only (`POST /users/{id}/activate`) and stays that way — a deactivated user can't log in to reactivate themselves.

## Goals

- Let a non-Admin user deactivate their own account from the Profile page, using the exact same mechanism as admin-deactivation (flag + Supabase ban).
- Log the user out immediately on success.
- Audit-log the event (and close the pre-existing gap where admin activate/deactivate wrote no audit row either).

## Non-goals

- Hard-deleting the account or its data (a `delete_user` admin wrapper exists but stays unused here).
- A request-to-admin approval flow (explicitly rejected in favor of immediate self-deactivation).
- The other Profile sub-features (2FA, Active Sessions).
- Fixing the broader enforcement gap (nothing but the ban checks `is_active`) — a real defense-in-depth concern, tracked separately, not fixed here.

## Architecture

### Shared deactivation logic

Today the flag+ban logic lives inside `UsersService.set_active`. Extract the core (flip `users.is_active`, call the Supabase ban, write the audit row) into a shared helper both paths call, rather than duplicating it or loosening the admin endpoint's auth to accept self-calls.

- The admin path (`POST /users/{id}/deactivate` / `/activate`) keeps its `RequireAdmin` gate and now also writes an audit row.
- The self path is a new endpoint in the `me` feature (a self-scoped action, sibling to `PATCH /me`), not the admin `users` router.

### Endpoint

`POST /me/deactivate` — any authenticated user. `MeService.deactivate(session, user, supabase)`:
1. **Guard:** `user.role == Admin` → `403 ForbiddenError`. Admins keep managing deactivation via the admin users page; this sidesteps the last-admin-orphans-the-school problem with no count query. Matches the stub's existing "Admin accounts cannot be self-deactivated" copy, now backed by a real check.
2. Calls the shared helper with the caller's own uid → flips `users.is_active = False` + issues the Supabase ban. Leaves the linked `staff`/`guardian` row's own `is_active` untouched, exactly as admin-deactivation does today.
3. Writes an `audit_log` row with a new `ACCOUNT_SELF_DEACTIVATED` action (actor = the user themselves).

No request body; returns `204` (or a minimal `{ ok: true }` — implementation picks the simplest that the typed client handles cleanly).

### Audit actions

Add to `apps/api/app/features/audit/actions.py`:
- `ACCOUNT_SELF_DEACTIVATED` — the self path.
- `USER_DEACTIVATED` / `USER_REACTIVATED` — the admin path (closing the existing no-audit gap).

### Frontend

`DangerTab`:
- **Non-Admin:** real `AlertDialog` confirmation (matching the admin `UsersTable` deactivate pattern) → `api.me.deactivate()`. On success: `supabase.auth.signOut()` client-side, then redirect to `/login?deactivated=1`. The client sign-out is what makes logout *immediate* — the current access token stays valid (~1h) otherwise; only token refresh would fail.
- **Admin:** keep the existing disabled state, now also backed server-side by the `403`.
- On `ApiError`, `toast.error(...)` per the standard mutation pattern.

Login page reads `?deactivated=1` and shows "Your account has been deactivated. Contact your administrator to reactivate."

## Error handling

- Admin self-deactivation → `403` (guard), surfaced as a toast (the UI already blocks the button, so this is defense-in-depth).
- Supabase service-role key unset (local without it) → the ban call raises `ServiceUnavailableError` → `503`, same as admin-deactivation today. Acceptable; deactivation genuinely can't be enforced without it.
- All wrapped in the existing `ApiError` → `toast.error` flow.

## Testing

Backend (reusing the existing `fake_supabase` fixture the admin-deactivation tests use):
- Non-Admin self-deactivate → `users.is_active` false, Supabase ban called with the permanent duration, `ACCOUNT_SELF_DEACTIVATED` audit row written.
- Admin self-deactivate → `403`, no state change.
- Linked `staff.is_active` is untouched after a staff member self-deactivates.
- Admin path now writes `USER_DEACTIVATED` / `USER_REACTIVATED` audit rows (extend existing admin-deactivation tests).

Frontend: no component test (matches repo precedent — no component-testing infra).

## Open questions

None outstanding — behavior (immediate), role policy (all non-Admin), reuse-vs-duplicate (shared helper), and the admin-path audit backfill were all settled during brainstorming.
