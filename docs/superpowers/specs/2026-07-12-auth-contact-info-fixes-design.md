# Auth contact-info fixes — design

PR 1 of a 4-part "close the email/SMS gaps" initiative (2: appointments notifications + HTML email templates, 3: leave requests, 4: attendance absence — all separate, later PRs). This PR fixes two real bugs/gaps in how phone numbers move between this app's local DB and Supabase Auth, plus switches the active SMS provider to Arkesel (needed here since this is the first PR that actually sends an SMS).

## Pre-design audit — ground truth

- `MeService.update` (`apps/api/app/features/me/service.py:106-188`) writes `phone` straight to `guardians.phone`/`staff.phone` but only syncs `display_name` to Supabase (`update_user_by_id(user_metadata=...)`, lines 159-162). Phone is never synced. A user who changes their phone in Profile → Personal Information sees a success toast, but Supabase Auth's own `phone` (what `signInWithOtp` authenticates against) silently keeps the old value — OTP login continues to work with the old number, not the new one, no error shown.
- `GuardiansService.update` (`guardians/service.py:87-98`) / `StaffService.update` (`staff/service.py:106-130`) are generic `setattr` loops with no `supabase` param in scope at all — same gap, Admin-driven side.
- `UsersService.provision_login` (`users/service.py:169-254`): email-present accounts get Supabase's own `invite_user_by_email` (real transactional email, no custom code needed). Phone-only accounts (`create_user(phone=..., phone_confirm=True)`, line ~220) get nothing — no email, SMS, or in-app message. No way to discover the account exists.
- `sms/jobs/sms_fanout.py` — a generic, already-built, event-triggered (`sms/fanout.requested`) SMS fan-out job exists but nothing emits to it yet. Payload: `{school_id, category, body, recipients: [{phone, guardian_id: str|null}]}`.
- `SmsProvider` Protocol (`app/integrations/sms/provider.py`) is already provider-agnostic: `name` + `async def send(*, phone, body) -> SmsSendResult`. `HubtelSmsProvider` is fully self-contained; no Hubtel-specific shape leaks to callers. `get_sms_provider()` branches on `settings.hubtel_client_id/secret/sender_id`. `SmsProviderName` (`sms/constants.py`) is `Literal["stub", "hubtel"]`; `sms_log.provider`/`category` columns are `String(20)` with no DB check constraint — adding new Literal values needs no migration.
- No Ghana-phone-format validation exists anywhere in the codebase today.
- Arkesel's send endpoint (per two independently-fetched public doc pages): `POST https://sms.arkesel.com/api/v2/sms/send`, header `api-key: <key>`, body `{"sender": "...", "message": "...", "recipients": ["+233XXXXXXXXX", ...]}`. The success-response JSON shape wasn't reliably confirmed from public docs — the implementation treats HTTP 200 as the success signal (matching the one behavior both sources agreed on) and best-effort-extracts a message id, tolerating its absence. **Needs a real API key for a final smoke test before this ships live** (same caveat Hubtel shipped with — config-gated, stub fallback until then).

## 1. Phone-resync — self-service

Supabase requires OTP verification to change a `auth.users.phone` value via the client SDK (mirrors its email-change behavior) — this is used as the security mechanism, not built from scratch:

1. Profile page gets a dedicated "Change phone number" flow (separate from the rest of the form, mirroring `LoginForm.tsx`'s existing OTP UI pattern) instead of a plain editable `phone` input wired to `PATCH /me`.
2. User enters the new number (normalized client-side via a shared `normalizeGhanaPhone` helper) → `supabase.auth.updateUser({ phone })`. This sends an OTP to the new number; nothing changes yet.
3. User enters the code → `supabase.auth.verifyOtp({ phone, token, type: "phone_change" })`. On success, Supabase Auth's `phone` is now confirmed to the new value.
4. Frontend calls new `POST /me/phone/confirm` (no body). Backend reads the caller's **current confirmed phone straight back off Supabase Auth** (new `SupabaseAdminClient.get_user_by_id`) and writes that exact value into `guardians.phone`/`staff.phone`. Nothing user-supplied is trusted directly by this endpoint — it only ever mirrors what Supabase itself already confirmed, so hitting it directly can't be used to spoof a phone number.
5. `MeUpdate.phone` is removed from the generic `PATCH /me` write path entirely (`MeRead.phone` stays, read-only). Phone changes go exclusively through this flow from now on.

## 2. Phone-resync — Admin-driven

`GuardiansService.update`/`StaffService.update` gain a `supabase: SupabaseAdminClient` param. When `phone` is among the changed fields: look up the linked `users.id` (mirrors `NotificationsService.find_user_for_linked`), call `supabase.update_user_by_id(phone=normalized, phone_confirm=True)` directly — no OTP, trusted the same way Admin is already trusted to create accounts and set the initial phone. If no linked user exists yet (guardian/staff never had login provisioned), just update the local field — nothing to sync yet.

## 3. Ghana phone normalization

New `app/core/phone.py`:
```python
def normalize_ghana_phone(raw: str) -> str:
    """Accepts 0XXXXXXXXX (local), 233XXXXXXXXX, or +233XXXXXXXXX.
    Returns +233XXXXXXXXX. Raises ValueError on anything else."""
```
Applied via a Pydantic `field_validator` on `GuardianCreate`/`GuardianUpdate`/`StaffCreate`/`StaffUpdate`'s `phone` field (validation error surfaces as the existing 422 path, no new error-handling plumbing). Mirrored as a small `normalizeGhanaPhone` TS helper (`apps/web/src/lib/phone.ts` or similar) used by the new self-service phone-change form before calling Supabase, so the OTP is sent to the same canonical form that eventually lands in the DB.

## 4. Onboarding SMS

New `"onboarding"` value on `SmsCategory` (`sms/constants.py`) — no migration needed (see audit). `UsersService.provision_login`'s phone-only branch, right after the `User` row insert + `USER_CREATED` audit log, emits `sms/fanout.requested` with one recipient (`{phone, guardian_id: <guardian id if this is a parent account, else null>}`), category `onboarding`, body: `"Your UHAS SMS account is ready — log in with your phone number at {app_url}/login."` Best-effort `try/except` around the emit (Sentry-reported, never fails account creation), same pattern as the existing email emits. No opt-out, no `notification_defaults` gate — treated as transactional/essential (there's no `user_preferences` row yet to check, and gating it would recreate the exact "nobody told me my account exists" gap this PR fixes).

## 5. Arkesel provider

New `ArkeselSmsProvider(SmsProvider)` in `app/integrations/sms/provider.py`:
```python
class ArkeselSmsProvider:
    name: SmsProviderName = "arkesel"
    def __init__(self, *, api_key: str, sender_id: str) -> None: ...
    async def send(self, *, phone: str, body: str) -> SmsSendResult:
        # POST https://sms.arkesel.com/api/v2/sms/send
        # header api-key: <api_key>
        # body {"sender": sender_id, "message": body, "recipients": [phone]}
        # HTTP 200 => sent; anything else => failed (httpx.HTTPError caught,
        # logged, same shape as HubtelSmsProvider's error handling)
```
New config fields `arkesel_api_key: str | None`, `arkesel_sender_id: str | None` (mirrors the Hubtel fields' style — `Field(default=None)` + a `description` on the sender id). `get_sms_provider()` becomes:
```python
def get_sms_provider() -> SmsProvider:
    if settings.arkesel_api_key and settings.arkesel_sender_id:
        return ArkeselSmsProvider(api_key=settings.arkesel_api_key, sender_id=settings.arkesel_sender_id)
    if settings.hubtel_client_id and settings.hubtel_client_secret and settings.hubtel_sender_id:
        return HubtelSmsProvider(...)
    return StubSmsProvider()
```
Arkesel takes precedence when configured; Hubtel still works as a fallback if only it's configured (nothing breaks for existing deployments); stub otherwise. `SmsProviderName` gains `"arkesel"`.

## 6. Email-resync (mid-PR addition, same shape as phone)

Mid-implementation, checking "does this app fully support email + phone for parents" surfaced the exact same bug class for email: `GuardiansService.update`/`StaffService.update` never synced `email` to Supabase either (only `UsersService.update` — the separate `/users/{id}` admin-user-management surface — already did, correctly). Fixed identically, with one structural difference: unlike phone (whose only source of truth is `guardians.phone`/`staff.phone`), email's canonical value for login purposes is `users.email` (the bridge table `MeRead.email` actually prefers), with `guardian.email`/`staff.email` as a secondary display mirror.

- **Admin-driven**: `GuardiansService.update`/`StaffService.update`, when `email` changes: update the linked `users.email` row directly (in the same session) and call `supabase.update_user_by_id(email=new_email, email_confirm=True)` — trusted, no confirmation link, same as phone's `phone_confirm=True`. `SupabaseAdminClient.update_user_by_id` gains an `email_confirm: bool = False` param to match `phone_confirm`.
- **Self-service**: Supabase confirms an email change via a link the user clicks in their inbox (`updateUser({ email })`), not an inline OTP — there's no synchronous "verify" step to pair with a code-entry UI the way phone has. New `POST /me/email/confirm` (mirrors `/me/phone/confirm`'s "never trust client input, only mirror what Supabase already confirmed" contract) updates both `users.email` and the linked guardian/staff row. Since there's no callback moment to call it at, the frontend calls it best-effort on every Profile-page load (silently a no-op if nothing's pending) — self-heals once the user clicks the link, without needing a dedicated "sync now" action.
- `MeService.confirm_email` overrides the `MeRead.email` in its own response with the freshly-confirmed value rather than falling through to `MeService.get`'s normal `user.email or user_row.email` precedence — the caller's JWT claim is the *stale* side immediately after a confirm (it won't carry the new address until the session's next token refresh), so without the override the response would echo the old email back for one round trip.
- UI messaging: added explicit "this is also your login" notes near the Profile phone/email fields, the Admin "add guardian" form (`GuardianField.tsx`), and the Admin "create staff" form (`StaffRegistrationForm.tsx`) — the audit's other prompt was "does an Admin realize typing a phone number into a guardian record isn't just a contact field."

## Out of scope

- Actually registering/paying for an Arkesel account, sender ID approval, or a live end-to-end send test — that needs real credentials from the user; ships config-gated exactly like Hubtel did.
- Re-verifying a phone/email that was set by Admin (Admin-driven changes are trusted, not challenged).
- Email-having users' automatic Supabase invite email — untouched by this PR (already worked correctly).
- Anything from PRs 2-4 (appointments, leave, attendance notifications; HTML email templates).

## Testing

- Backend: `normalize_ghana_phone` unit coverage (all three accepted input shapes + rejected garbage); `POST /me/phone/confirm` and `POST /me/email/confirm` (mirror Supabase's confirmed value into the local row(s), reject if nothing confirmed yet); `GuardiansService.update`/`StaffService.update` phone- and email-change → `supabase.update_user_by_id` called with the right args, `users.email` updated in the email case (fake `SupabaseAdminClient`, same DI pattern as `fake_storage`); `provision_login` phone-only path emits `sms/fanout.requested` with the right payload (monkeypatch `inngest_client.send`, mirrors `test_rejection_email.py`'s pattern) and email-present path does not; `ArkeselSmsProvider.send` against a mocked HTTP response (respx, same tool `HubtelSmsProvider` tests already use).
- Frontend: no new Vitest coverage planned for the email/phone-change UI components (matches this codebase's existing convention — Vitest covers pure-logic utilities only); `normalizeGhanaPhone` gets one, matching `exams/utils.test.ts`'s precedent.
