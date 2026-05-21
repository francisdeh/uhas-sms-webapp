# Deployment Checklist

Production deploy checklist for the UHAS SMS app. Walk this top-to-bottom on every release that touches database schema, Firebase config, or storage rules. For routine code-only releases, the **Release runs** + **Post-deploy smoke** sections are enough.

Target stack: **Next.js app on Railway** + **Neon Postgres** + **Firebase Auth & Storage** (real project, no emulators).

---

## 1. Database (Neon Postgres)

- [ ] Confirm the Neon project + branch you're targeting (prod vs staging — they should be separate Neon branches, never shared).
- [ ] Back up the current DB if it has real data:
  ```bash
  pg_dump "$DATABASE_URL" > backup-$(date +%F).sql
  ```
- [ ] Verify migrations are committed: `drizzle/0000_daily_unicorn.sql` and any later files. **`db:push` is intentionally not used** — migrations are the only path to a schema change so the SQL is reviewable in the PR.
- [ ] Railway env vars set:
  - `DATABASE_URL` — Neon connection string with `?sslmode=require`
  - `DB_DRIVER` — `neon-http` for Neon, `pg` for Railway Postgres. The client also auto-detects `*.neon.tech` hosts, but the var is the source of truth.
- [ ] Release runs the migrator + idempotent prod seed, wired in [`railway.toml`](../railway.toml):
  ```
  npm run db:migrate && npm run db:seed:prod && npm run start
  ```
  `db:seed:prod` is `--idempotent --no-demo` — creates/keeps the school + Firebase-backed users only, no demo data.
- [ ] Tables added by the deferred-tasks branch (verify they appear after the first migrate against an existing prod DB): `staff_attendance_sessions`, `staff_attendance_records`, `promotion_seasons`, `promotion_submissions`, `promotion_decisions`, `audit_log`, plus extra columns on `students` / `enrollments` / `exams`.

## 2. Firebase Auth

- [ ] Real Firebase project exists. Its project ID must match both `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `FIREBASE_PROJECT_ID` — they always equal each other.
- [ ] Service-account key generated: **Firebase Console → Project settings → Service accounts → Generate new private key**. From the JSON:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` — paste the full PEM. Railway accepts the literal `\n` escapes; the Admin SDK init normalizes them.
- [ ] Client SDK config from **Firebase Console → Project settings → SDK setup → Config**:
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- [ ] **Authorized domains** — Authentication → Settings → Authorized domains: add your Railway domain (`*.up.railway.app`) and any custom domain.
- [ ] **Email/Password sign-in** enabled — Authentication → Sign-in method.
- [ ] **Reset-password email template** customized — Authentication → Templates → Password reset.
- [ ] Seed the production users + custom claims once (locally, with `.env.seed` pointing at PROD service-account creds):
  ```bash
  npm run seed:firebase -- --dry-run    # preview
  npm run seed:firebase                 # additive: create missing, set claims on existing
  ```
  This sets the `role` custom claim the proxy + `loginAction` rely on. Re-run with `--force` only if you need to reset a password on an existing user.
- [ ] Production cookies are `secure` — already enforced by [`src/features/auth/actions/login.ts`](../src/features/auth/actions/login.ts) (`secure: NODE_ENV === "production"`). The app must be served over HTTPS. Railway provides HTTPS by default.

## 3. Firebase Storage

- [ ] Storage bucket exists — Firebase Console → Storage → Get started. Bucket name must match `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
- [ ] Deploy storage rules to prod:
  ```bash
  firebase deploy --only storage --project <prod-project-id>
  ```
  Note: `--only storage` (no `:rules` suffix). The Firebase CLI treats `storage:rules` as a deploy *target* name, not as "the rules section," and errors with `Could not find rules for the following storage targets: rules`.
  Rules in [`storage.rules`](../storage.rules): `photos/**` public read with size + content-type limits; `documents/**` signed-URL-only via firebase-admin; deny all else.
- [ ] Service-account permissions — the same key used for Auth must have **Storage Admin** in IAM (needed for `getSignedDownloadUrl` on `documents/**`). Check: Google Cloud Console → IAM → find the `firebase-adminsdk-...` service account → ensure `roles/storage.admin` is attached (the auto-generated SA usually has it).
- [ ] **No emulator host vars set on Railway** — verify `FIREBASE_AUTH_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST` are **unset**. If set, prod traffic silently redirects to localhost emulators.

## 4. Outbound email (Gmail SMTP)

App-level notifications (currently: lesson-plan-rejection emails to teachers) go through [`src/lib/email.ts`](../src/lib/email.ts). When the SMTP vars are unset, emails are logged instead of sent — safe for dev, CI, and tests. Reset-password emails are not in this path; Firebase Auth handles those itself.

For a school-domain Workspace account you'd set "Send mail as" with SPF/DKIM so emails appear to come from `noreply@uhas.edu.gh`. For a personal Gmail you'll send as the personal address; recipients see that.

- [ ] **Enable 2FA** on the Gmail account that will send mail (Google Account → Security).
- [ ] **Generate an App Password** (Google Account → Security → 2-Step Verification → App passwords). Copy the 16-char password.
- [ ] **Railway env vars**:
  - `SMTP_HOST=smtp.gmail.com`
  - `SMTP_PORT=465`
  - `SMTP_USER=<gmail-address>`
  - `SMTP_PASS=<16-char app password>` — **not** the account password
  - `EMAIL_FROM='UHAS SMS <noreply@uhas.edu.gh>'` (or the Gmail address if not using a domain alias)
  - `APP_URL=https://<railway-or-custom-domain>` — links in emails land here
  - Do **not** set `EMAIL_DEV_REDIRECT` in production (it's a dev safety net)
- [ ] **Gmail quota awareness**: ~500 emails/day personal, ~2,000/day Workspace. If you ever bulk-send (e.g. "Term 3 reports published" → every parent), watch the quota or swap to Resend/SendGrid for that one job. The transport in `src/lib/email.ts` is swappable in one place.
- [ ] **Smoke test post-deploy** — log in as a Unit Head, expand a submitted lesson plan, type a comment, click Reject. The teacher receives an email with the comment + a link to the plan.



- [ ] CI is green on `main` — lint + tsc + Vitest (128 tests) + Playwright E2E (the heavy job runs only on push to main).
- [ ] `grep -r USE_MOCK_DATA src/` returns nothing — flag is removed; mock files no longer exist.
- [ ] Optional pre-flight: build locally against a `.env.prod-mirror` file with the same vars Railway will inject (`npm run build`). Catches missing env vars before the deploy.

## Release runs

Triggered by pushing to `main`. Railway:

1. Builds with Railpack + Node 20 (per [`railway.toml`](../railway.toml)).
2. Executes `npm run db:migrate && npm run db:seed:prod && npm run start`.
3. Restart policy: `on_failure`, up to 5 retries.

The migrate + seed steps are idempotent and safe to re-run on every deploy.

## Post-deploy smoke

Run after every release that touches DB / Auth / Storage. Login as Admin (seeded credentials) and walk:

1. Login lands on `/admin` — confirms Auth + session cookies are working.
2. **Register a student** via the UI → success toast → row appears in the list. Confirms DB writes + audit-log + form flow.
3. **Open Lesson Plans review queue** as Unit Head / Deputy Head → either empty state or seeded items render. Confirms the role proxy + division-scoped queries.
4. **Upload a photo** to a student → image displays in the avatar component everywhere it appears. Confirms Storage write + public-read `photos/**` rule.
5. **Upload a document** to a lesson plan → "View attachment" link issues a fresh 1-hour signed URL on click. Confirms server-side signing + `documents/**` rule + Storage Admin IAM role.
6. **Hit `/admin/audit-log`** → at least the entries from steps 2 and 4 appear with the correct admin email.
7. **Force a session expiry** by editing the `session_expires_at` cookie in DevTools to a past timestamp → the expiry warning modal fires before the next nav.

If any step fails, **roll back** before investigating — don't leave a broken release running.

## Rollback

- **Railway:** redeploy the previous successful build from the Deploys tab. One click.
- **Database:** migrations are forward-only. If a migration must be reversed, write a new migration that performs the reverse and re-deploy. **Never** hand-edit `drizzle/meta/_journal.json` against prod or run `db:rollback` — both desync the journal from the schema.
- **Firebase:** rules + users persist across rollbacks; no action needed.
- **Storage:** uploaded files persist; no action needed.

## Out of scope for this branch

These deliberately are not part of this deploy:

- **Higher-volume / branded outbound email** (Resend, SendGrid, Postmark). Gmail SMTP is wired now via [`src/lib/email.ts`](../src/lib/email.ts) — good for the current notification volume. Swap when bulk sends become routine or you need bounce / open analytics.
- KG-specific report card variant — awaiting the school template.
- Multi-school tenancy — every query still filters by a fixed `schoolId` constant; opening tenancy up is a future spec.
