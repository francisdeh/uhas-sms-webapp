# 2FA / TOTP authenticator — design

**Date:** 2026-07-06
**Phase:** 3.5 — Platform completion & admin polish (Profile page completion, final sub-feature)
**Status:** Approved, ready for implementation

## Context

The Profile Security tab's MFA flow is a mock: `mfaEnabled` is a hardcoded `false`, the "QR" panel literally reads "2FA setup coming soon", the verify step never sends the code anywhere, and the backup-codes are six hardcoded strings. No `.mfa.` call exists anywhere in `apps/web`.

Audit of the installed `@supabase/auth-js` 2.108.2 confirmed the full TOTP surface is available:
- **Client**: `mfa.enroll` (returns `totp.qr_code` — a ready-to-render SVG string — plus `secret` and `uri`), `mfa.challenge`, `mfa.verify`, `mfa.unenroll`, `mfa.listFactors`, `mfa.getAuthenticatorAssuranceLevel` (returns `currentLevel` / `nextLevel` of `'aal1'|'aal2'`).
- **Admin (JS + Python both)**: `auth.admin.mfa.listFactors({userId})` + `deleteFactor({id,userId})`. Python `supabase_auth` exposes `admin.mfa.list_factors` / `delete_factor`. `deleteFactor` also logs the user out.

Key facts that shaped scope:
- **No backup/recovery codes.** The MFA API has no recovery-code concept — dropped. Lockout recovery is admin-reset instead.
- **TOTP is disabled in `supabase/config.toml`** (`enroll_enabled`/`verify_enabled = false`) — must be enabled.
- **The proxy does no AAL check today**; `security.py` doesn't read the `aal` claim (though the JWT carries it).

## Goals

- Real opt-in TOTP 2FA: a user enrolls an authenticator from their Profile, and is then challenged for the 6-digit code at every login.
- Genuinely enforced (not bypassable by direct navigation) via a proxy-level AAL gate.
- A recovery path for a lost authenticator (admin reset), since backup codes aren't available.

## Non-goals

- Backup / recovery codes (not supported by Supabase; would be a custom table + hashing — a separate future feature).
- Forcing 2FA on any role — it stays opt-in per user.
- **FastAPI API-layer AAL enforcement** — the API won't reject an `aal1` token from an enrolled user. The proxy gate enforces the web layer; obtaining an `aal1` token already requires the correct password. Documented as a further-hardening item, not built here.
- SMS/phone or WebAuthn factors — TOTP only.

## Architecture

### 0. Config
`supabase/config.toml`: `[auth.mfa.totp]` `enroll_enabled = true`, `verify_enabled = true`. DEPLOY.md gains a note that production Supabase must enable MFA in its dashboard (the local flag doesn't carry to the hosted project).

### 1. Enrollment — `SecurityTab` in `ProfilePage.tsx` (client)
Replace the mock card. Real states derived from `mfa.listFactors()`:
- **Not enrolled** → "Enable authenticator app" button.
- **Enrolling**: `mfa.enroll({ factorType: 'totp' })` → render `data.totp.qr_code` (SVG) + show `data.totp.secret` for manual entry → 6-digit input → `mfa.challenge({ factorId })` then `mfa.verify({ factorId, challengeId, code })`. On success the factor is verified and the session steps up to aal2. Show a success state.
- **Enrolled** → green "Enabled" badge + a "Disable" button → confirm → `mfa.unenroll({ factorId })`.
- **Cancel during enrollment** unenrolls the just-created unverified factor so no orphan lingers.

Errors → `toast.error` with the Supabase message (invalid code, etc.), matching the app's pattern.

### 2. Login challenge — `LoginForm.tsx` (client)
Add an `"mfa"` stage to the existing stage machine. After a successful `signInWithPassword` / `verifyOtp` (both funnel through `applyAuthedUserOrSignOut`), first call `getAuthenticatorAssuranceLevel()`:
- `currentLevel === 'aal1' && nextLevel === 'aal2'` → switch to the `"mfa"` stage: `listFactors()` → the verified TOTP factor → `mfa.challenge` → user enters code → `mfa.verify`. On success, continue to the existing role-dashboard redirect.
- Otherwise (no factor, or already aal2) → proceed straight to redirect as today.

### 3. Proxy enforcement gate — `proxy.ts` + `/verify-2fa` page
The gate that makes 2FA un-bypassable. In the proxy, only for an authenticated request to a dashboard route (skip `/login`, `/verify-2fa`, `/change-password`, static/asset paths): call `getAuthenticatorAssuranceLevel()`; if the user is enrolled but at `aal1` (`currentLevel !== nextLevel && nextLevel === 'aal2'`), redirect to a standalone **`/verify-2fa`** page. That page runs `challenge` + `verify`, then redirects to the user's role dashboard. This catches the "abandoned the login challenge, then navigated directly" path. Cost: one GoTrue call on dashboard routes when a session exists — acceptable at this app's scale; explicitly skipped on public/auth routes.

### 4. Admin reset — FastAPI (lockout recovery)
`POST /users/{id}/reset-mfa` (Admin-only). `UsersService.reset_mfa` calls the Python admin client: `admin.mfa.list_factors(user_id)` → `admin.mfa.delete_factor(...)` for each factor. Writes an audit row (`USER_MFA_RESET`). Deleting a verified factor also logs the user out (Supabase behavior), which is fine — they'll re-enroll after logging back in with just their password. Surfaced as a row action in the admin `UsersTable`.

## Error handling

- Enrollment/verify/challenge failures → `toast.error(error.message)`. An invalid 6-digit code is the common case.
- `getAuthenticatorAssuranceLevel` failure in the proxy → fail *open* is unacceptable for a gate, but failing *closed* (blocking everyone on a transient GoTrue hiccup) is worse for availability. The gate treats an errored AAL check as "no step-up required" (fail-open) and logs it — the login-time challenge is the primary enforcement; the proxy gate is the backstop for the direct-navigation edge case, so a rare transient miss is acceptable. (Documented tradeoff.)
- Admin reset: standard `ApiError` → `toast.error`; audit row only written on success.

## Testing

**Backend**: `POST /users/{id}/reset-mfa` — extend the `fake_supabase` fixture with an `mfa.list_factors` / `delete_factor` stub; assert `delete_factor` called per factor, `USER_MFA_RESET` audit row written, and non-admin → 403.

**Frontend**: no component tests (repo precedent — no component-test infra). Manual verification against the live stack, computing real TOTP codes from the enrollment secret (Python `pyotp`-style HMAC) to drive:
1. Enroll → verify → factor shows as verified (`listFactors`).
2. Fresh login → challenged for the code → reaches dashboard at aal2.
3. Abandon the challenge, navigate directly to a dashboard → proxy redirects to `/verify-2fa`.
4. Admin reset → the user's factor is deleted (`listFactors` empty) and they're logged out.
5. Disable from Profile → factor removed, next login no longer challenges.

## Open questions

None outstanding — behavior (opt-in TOTP), backup codes (dropped), recovery (admin reset via FastAPI), enforcement (proxy gate included; API-layer AAL documented-not-built), and factor type (TOTP only) were all settled during brainstorming.
