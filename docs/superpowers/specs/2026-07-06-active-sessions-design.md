# Active Sessions — "sign out other devices" — design

**Date:** 2026-07-06
**Phase:** 3.5 — Platform completion & admin polish (Profile page completion, penultimate sub-feature)
**Status:** Approved, ready for implementation

## Context

The Profile page's `SecurityTab` shows an "Active Sessions" card driven by `MOCK_SESSIONS` (`ProfilePage.tsx:54-58`) — a hardcoded list of three fake devices (MacBook / iPhone / Windows), each with a "Revoke" button that has **no `onClick`** (`ProfilePage.tsx:429-431`). It is pure presentation.

An audit of the installed Supabase SDK (`@supabase/auth-js` 2.108.2) found that a **real per-device session list is not achievable**:
- `GoTrueAdminApi` exposes no `listUserSessions` / `deleteSession` — only `listUsers`, `signOut`, `updateUserById`, `deleteUser`, etc.
- The `Session` type carries only tokens + the user object — **no device / user-agent / IP / last-active** field to render or target.
- The only way to get real device rows would be to query GoTrue's *internal, undocumented* `auth.sessions` Postgres table directly from FastAPI — coupling us to a private schema Supabase can change on any auth upgrade. Explicitly rejected.

What the SDK **does** support (`GoTrueClient.signOut(options?: SignOut)`, `SignOut.scope?: 'global' | 'local' | 'others'`):
- `'others'` — revoke every other session, keep the current one.
- `'global'` — revoke everything including the current session (this is the default, and what the app's existing logout buttons already do).
- `'local'` — current session only.

## Goals

- Replace the fake device list with a real, honest action: **sign out of all other sessions**, keeping the current one alive.
- Deliver the actual security value — revoking a session left on a shared or public computer — without fabricating device data or coupling to a private schema.

## Non-goals

- A per-device session list with per-row revoke (not achievable via any supported API — see Context).
- Any backend work — this is entirely client-side (`api.d.ts`, FastAPI, DB all untouched).
- The 2FA / backup-codes card in the same `SecurityTab` (the last remaining Profile sub-feature; separate).

## Architecture

Entirely within `SecurityTab` in `apps/web/src/features/profile/components/ProfilePage.tsx`. No new files, no new dependencies.

- Remove the `MOCK_SESSIONS` constant and the fake per-device rows.
- The "Active Sessions" card becomes:
  - A short, honest description: signed in on a shared/public computer? Sign out of all other sessions; you'll stay signed in here.
  - A single **"Current session — currently active"** indicator row (truthful — we know the current session exists — with no fabricated device label).
  - A **"Sign out other devices"** button → lightweight `AlertDialog` confirm → `createSupabaseClient().auth.signOut({ scope: 'others' })`.
- On success: `toast.success("Signed out of all other devices.")`. **No redirect** — preserving the current session is the whole point of `'others'`.
- On error: `toast.error(error.message ?? "Could not sign out other sessions.")` — matches the app's standard mutation error pattern.

The browser Supabase client is already imported in this file (`createClient as createSupabaseClient`, `ProfilePage.tsx:10`), and `AlertDialog` primitives are already imported for the Danger-zone flow — no new imports beyond what's present.

## Error handling

- Supabase `signOut` returns `{ error }`; a non-null error is toasted. There's no partial-failure state to reconcile — it either revokes the other sessions or it doesn't.
- The current session is never touched by `scope: 'others'`, so there's no logout-of-self edge case to guard.

## Testing

Manual verification against the live stack (no automated test — client-only, and the repo has no component-test infra, consistent with the prior Profile sub-features):
1. Open two real sessions for one account (two password-grant logins → two refresh tokens).
2. Trigger `scope: 'others'` from session A.
3. Confirm session B's refresh token is now revoked (a refresh attempt fails) while session A still refreshes successfully.

## Open questions

None outstanding — the approach (scope-based sign-out over a fabricated device list), the specific scope (`'others'`, preserving the current session), and the no-backend boundary were all settled during brainstorming.
