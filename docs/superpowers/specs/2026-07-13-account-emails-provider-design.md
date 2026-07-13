# Account emails: real provider + branded invite/reset/change — design

Tier 2 of the post-go-live-audit backlog ("Onboarding staff. Send out invite email. Mailpit for dev, postmark or brevo or resend for prod.") — expanded during scoping to cover parent invites and the other two Supabase-handled account emails, per user direction.

## Pre-design audit — ground truth

- Staff creation is two disjointed steps today: `StaffRegistrationForm.tsx` creates a `staff` row only (no auth user) and shows a **hardcoded placeholder** `inviteLink` (`/invite?token=${row.id}`, comment: "Placeholder link until the Auth invite flow is wired in Phase 3"). A login is provisioned separately via the generic `/admin/users` page (`POST /users` → `UsersService.create` → `provision_login`).
- `provision_login` (`apps/api/app/features/users/service.py:176`) is **shared** by both staff and guardian login provisioning. When an email is present, it calls Supabase's own `invite_user_by_email` — Supabase sends its own generic invite email, entirely separate from this app's branded Jinja2 system (`base.html` + 7 email kinds built across this session's last 4 PRs). Guardians already have a dedicated `POST /guardians/{id}/login` endpoint (`provision_guardian_login`); staff have no equivalent.
- Two other Supabase-handled account emails exist, both triggered **client-side, direct from the browser, with no backend involvement at all**:
  - Password recovery: `ResetPasswordForm.tsx` calls `supabase.auth.resetPasswordForEmail(email, {...})` directly.
  - Email change: `EmailChangeCard.tsx` calls `supabase.auth.updateUser({ email: newEmail })` directly.
- `apps/api/app/integrations/email/provider.py`'s `EmailProvider` protocol is provider-agnostic by design (`get_email_provider()` is the only place a new provider slots in). No production provider is configured anywhere — `.env.example` has SMTP vars commented out with Gmail-app-password placeholders; `docs/DEPLOY.md` already flags this as a pending go-live item and names Resend/SendGrid/Postmark as candidates.
- "Mailpit" in this repo today refers only to the Supabase CLI's own local Auth-email catcher (`127.0.0.1:54324`) — unrelated to this app's own SMTP path, which currently has no local catcher at all.
- `SupabaseAdminClient` (`apps/api/app/features/users/supabase_admin.py`) wraps `supabase-py`'s sync admin surface in `asyncio.to_thread`. No `generate_link` method exists yet — needed to mint invite/recovery/email-change links without Supabase auto-sending.

## Scope (decided)

- **Provider**: Resend for production. Mailpit for local dev.
- **Invite**: bypass Supabase's built-in emailer entirely — mint the link via `generate_link`, send via our own branded template + Resend. Applies to **both** staff and parent invites, since `provision_login` is shared.
- **Staff UX gap**: fixed in this PR — real `POST /staff/{id}/login` endpoint (mirrors guardians) + `StaffRegistrationForm.tsx`'s placeholder replaced with a working action.
- **Password recovery** and **email change**: bundled into this PR too (user's explicit call, overriding the recommendation to split them out) — both migrate to the branded system alongside invite.

## 1. Provider infrastructure

`apps/api/app/integrations/email/provider.py`:
- New `ResendEmailProvider` class implementing the existing `EmailProvider` protocol — POSTs to `https://api.resend.com/emails` via `httpx` (already a dependency), `{from, to, subject, html, text}`. Catches `httpx` errors into `EmailResult(success=False, error=...)`.
- New config: `resend_api_key: str | None` (`apps/api/app/core/config.py`), reusing the existing `email_from`.
- `SmtpEmailProvider.__init__`'s `user`/`password` become optional (`str | None`) — `_send()` only calls `smtp.login(...)` when both are present. This turns the existing SMTP path into a generic "any SMTP server, auth optional" provider, which is what lets it double as the local Mailpit path with zero new provider code.
- `get_email_provider()` priority: `resend_api_key` set → `ResendEmailProvider`; else `smtp_host` set → `SmtpEmailProvider` (real Gmail creds *or* local Mailpit, either works); else the existing not-configured stub.
- `docker-compose.yml` gains a `mailpit` service (SMTP `1025`, web UI `8025`). Local `.env` points `SMTP_HOST=localhost` / `SMTP_PORT=1025`, no credentials. Production Railway env sets `RESEND_API_KEY` + `EMAIL_FROM`; SMTP vars stay unset there.
- `email_dev_redirect`'s existing safety-valve behavior (non-prod redirect-all-to-one-address) stays SMTP-only for now — Resend is only ever configured in production per the above, so the redirect guard's existing scope is still correct.

## 2. Invite — staff and parent

`SupabaseAdminClient` protocol + `RealSupabaseAdminClient` gain:

```python
async def generate_link(
    self, *, type: Literal["invite", "recovery", "email_change_current", "email_change_new"],
    email: str, redirect_to: str, new_email: str | None = None,
) -> dict[str, Any]: ...  # returns {"action_link": ..., "user_id": ...}
```

`provision_login` swaps `invite_user_by_email` for `generate_link(type="invite", ...)`, then emits `email/account-invite.requested` (new event) with the link + recipient name/role instead of relying on Supabase's auto-send. New `account_invite.html` template (`{% extends "base.html" %}` — "Welcome to UHAS SMS, set your password to get started" + CTA button to the action link) and a new job `apps/api/app/features/users/jobs/account_invite_email.py`, mirroring `appointment_requested_email.py`'s exact shape (pure "send what I'm told", no DB access). Registered via a new `apps/api/app/features/users/jobs/__init__.py`.

This is **not gated by notification preferences** — same precedent as onboarding SMS ("always send, no opt-out"): you can't opt out of the email that lets you create your own account.

Because `provision_login` is the single shared path, this fixes the gap for staff and parent invites identically — no guardian-specific code changes needed beyond the shared function.

## 3. Staff login endpoint + UX fix

New `POST /staff/{staff_id}/login` (mirrors `POST /guardians/{guardian_id}/login` exactly): `UsersService.provision_staff_login` looks up the staff row, infers `role` from the row's own `system_role` (already one of `ADMIN`/`DEPUTY_HEAD`/`TEACHER`/`ACCOUNTANT` — no re-asking), sources `email`/`phone`/`display_name` from the same row, and delegates to `provision_login`.

`StaffRegistrationForm.tsx`'s success dialog: placeholder `inviteLink` replaced with a real "Send invite" button calling this endpoint — zero additional input needed since everything comes from the row just created.

## 4. Password recovery

New public (unauthenticated) endpoint `POST /auth/reset-password`, body `{ email }`. Calls `generate_link(type="recovery", email=...)`, sends via the branded system (new `password_reset.html` template + job) instead of Supabase's own recovery email.

**Anti-enumeration is the load-bearing detail here.** Supabase's client-side `resetPasswordForEmail` never reveals whether an account exists — always the same response. Our admin-side `generate_link` call *will* tell us if it doesn't (it's an authenticated admin operation, not the public anon-key call). The endpoint must swallow a not-found result and return the same generic `{"success": true}` either way, only actually sending an email when the account is real.

**Abuse guard**: a per-email cooldown, same idiom as `learner_fees.last_reminder_sent_at` — a nullable `last_password_reset_sent_at` on `users`, skip re-sending within 5 minutes regardless of the enumeration-safe response above.

`ResetPasswordForm.tsx` calls this new endpoint instead of `supabase.auth.resetPasswordForEmail` directly. The link-click destination and the actual password-set flow (`PASSWORD_RECOVERY` session → `supabase.auth.updateUser({password})`) are **unchanged** — only the delivery hop moves from Supabase's mailer to ours.

## 5. Email change

New authenticated endpoint `POST /me/email/request-change`, body `{ new_email }` (replaces `EmailChangeCard.tsx`'s direct `supabase.auth.updateUser({ email })` call).

**Spiked against the local Supabase CLI stack — confirmed working.** `generate_link(type="email_change_current", email=old, new_email=new, ...)` and `generate_link(type="email_change_new", email=old, new_email=new, ...)` both succeed independently, each returning its own `action_link` tied to the same pending-change state (the user object's `new_email` field is set after the first call) — this project's Supabase config has secure/dual-confirmation email change enabled, matching Supabase's default. Both links must be sent: `email_change_current`'s to the *old* address, `email_change_new`'s to the *new* address, matching Supabase's own dual-confirmation semantics exactly, just delivered through our branded system instead of Supabase's mailer.

New `email_change_current.html` + `email_change_new.html` templates (both `{% extends "base.html" %}`) + one job (`account_email_change.py`) that sends both messages from a single event payload (`{old_email, new_email, current_link, new_link}`) — one job invocation naturally produces two sends since a code change always confirms in reads-both-addresses.

## Testing

- Backend: `generate_link` added to the `FakeSupabaseAdminClient` test double; new tests for `provision_staff_login` (role inferred correctly, conflicts on existing login); the reset-password endpoint's enumeration-safe response (existing vs. non-existent email, both return identical shape) and its cooldown; each new email job's render + send (mirrors `test_jobs.py` pattern from prior PRs).
- Frontend: `StaffRegistrationForm`'s new invite action, `ResetPasswordForm`'s new endpoint call — Vitest coverage matches existing convention (logic-level, no component tests exist anywhere in this codebase).

## Out of scope

- Any change to Supabase's own template editor / dashboard config — this PR routes emails around it entirely rather than configuring it.
- MFA-related emails (`reset_mfa` has no email of its own today, unaffected).
- Any change to phone/SMS onboarding (PR 1, already shipped, untouched).
