# Supabase Migration — Change Outline (SUPERSEDED)

> **⚠️ This plan was not the one executed. Kept for historical record only — do not follow anything below.**
>
> Authored 2026-06-10, this document proposed a **minimal** migration: swap Firebase Auth/Storage for a **self-hosted** Supabase-on-Railway stack, while explicitly *keeping* Drizzle ORM, Next.js Server Actions as the mutation path, and the app's own custom session cookies (see its own §2 "What does NOT change" and decision D2/D3).
>
> **What actually happened instead** ("Strategy A", Phases 0–3 complete) was a far larger rewrite: Drizzle was fully removed in favor of a new **FastAPI + SQLAlchemy + Alembic** backend owning all data access and mutations; Next.js Server Actions were decommissioned in favor of a typed FastAPI client + TanStack Query; Supabase is used as a **hosted** project (not self-hosted on Railway); sessions are Supabase's own `@supabase/ssr` cookies, not custom ones. None of Track B/C/D/E's file-level plans below match the real codebase.
>
> **For the plan that was actually followed, see [v2/UHAS_Migration_Execution_Plan.md](../v2/UHAS_Migration_Execution_Plan.md).** For the real current architecture, see [CLAUDE.md](../CLAUDE.md) and [docs/HANDOVER.md](HANDOVER.md).
>
> Everything below this line is the original, superseded proposal, unedited.

---

---

## 1. Goal & target architecture

| Concern | Today | After migration |
|---|---|---|
| Database | Neon Postgres (prod) / Docker PG16 (local), Drizzle ORM | Supabase Postgres, **same** Drizzle ORM + migrations |
| Identity | Firebase Auth (client SDK + Admin SDK) | Supabase Auth (GoTrue) via `@supabase/supabase-js` + `@supabase/ssr` |
| Session | Custom httpOnly cookies (`session_uid`, `session_role`, …) minted in `login.ts` | **Unchanged model** — cookies still minted by our login action; only the identity provider underneath changes |
| File storage | Firebase Storage (Web SDK uploads + Admin signed URLs) | Supabase Storage (`supabase.storage`) with public + private buckets |
| Serverless functions | None (Next.js Server Actions only) | Supabase Edge Functions available; used for auth hooks / scheduled jobs / webhooks (see §7) |
| Outbound email | nodemailer / SMTP (`src/lib/email.ts`) | **Unchanged** (also wired into GoTrue for auth emails) |
| Hosting | Railway (Next.js process) | Railway (Next.js process) + Railway Supabase template services |

**Guiding principle:** Supabase *is* Postgres, and the app reaches the DB only through the `db` proxy in [`src/db/index.ts`](../src/db/index.ts). So the data layer barely moves. The real work is replacing the Firebase Auth and Firebase Storage SDKs. We keep our application-layer `schoolId` authorization model; we do **not** adopt PostgREST/RLS as the app's primary access path (see decision D2).

---

## 2. What does NOT change

These are explicitly out of scope — touching them is wasted effort:

- **All Drizzle schema** ([`src/db/schema.ts`](../src/db/schema.ts), 33 tables) and the 5 migration files in [`drizzle/`](../drizzle/).
- **All queries and actions business logic** across the 19 feature folders (~50 files import `db`). They consume the `db` proxy and never reference Neon directly.
- **TanStack Query, all UI components, Tailwind/shadcn, Zod forms.**
- **`src/lib/email.ts`** (nodemailer/SMTP) — provider-agnostic already.
- **`src/proxy.ts` routing logic** — it reads our own `session_role` / `session_uid` cookies, which we keep minting. Only the upstream token verification in `login.ts` changes.
- **`getCurrentSchoolId()` multi-tenant filtering** in every query.

---

## 3. Track A — Database (lowest risk, do first)

**Net app change: connection string + drop one driver.**

| File | Change |
|---|---|
| [`src/db/index.ts`](../src/db/index.ts) | Remove the `neon-http` branch and `makeNeon()`. Keep only the `pg` (`node-postgres`) driver — Railway runs a normal Node process, and Supabase wants a standard TCP pool. Simplifies `resolveDriver()` away entirely. |
| `package.json` | Remove `@neondatabase/serverless`. Keep `pg`, `drizzle-orm`, `drizzle-kit`. |
| `.env.local`, `.env.test`, `.env.e2e`, Railway vars | Point `DATABASE_URL` at Supabase Postgres connection string. Remove `DB_DRIVER`. |
| [`drizzle.config.ts`](../drizzle.config.ts) (verify) | No change expected — still points at `DATABASE_URL`. |

**Migrations:** `npm run db:generate` / `npm run db:migrate` run unchanged against Supabase's Postgres. Keep tables in the `public` schema so they don't collide with Supabase system schemas (`auth`, `storage`, `realtime`, `vault`).

**Connection-string caveats (self-hosted):**
- Supabase ships a connection **pooler** (Supavisor/PgBouncer) on a separate port from the direct Postgres port. Drizzle **migrations** must run against the **direct** connection (DDL + session features); the app runtime can use either. Document both URLs in env.
- Self-hosted defaults use the `postgres` superuser — fine for our single-app model, but rotate the template's default password.

**Verification:** point a local/staging app at the Supabase DB, run migrations, run the existing Vitest suite (`npm test`) — all green proves the data layer holds before any auth/storage work begins.

---

## 4. Track B — Auth (largest piece)

We use **Firebase Auth with a custom cookie session**: the client signs in and gets an ID token, `login.ts` verifies it server-side and mints our own httpOnly cookies. The session model survives; we swap Firebase SDK calls for Supabase ones.

### 4.1 New / replaced infra files

| File | Today | Becomes |
|---|---|---|
| [`src/lib/firebase.ts`](../src/lib/firebase.ts) | Firebase client init (auth + storage) | **New** `src/lib/supabase/client.ts` — browser client via `createBrowserClient` (`@supabase/ssr`) using `SUPABASE_URL` + publishable/anon key |
| [`src/lib/firebase-admin.ts`](../src/lib/firebase-admin.ts) | Firebase Admin SDK init | **New** `src/lib/supabase/admin.ts` — service-role client (`createClient` with `SERVICE_ROLE_KEY`, `auth.autoRefreshToken=false`), server-only |
| — | — | **New** `src/lib/supabase/server.ts` — request-scoped server client via `createServerClient` if we want Supabase to read/refresh sessions (see decision D3) |

### 4.2 Client-side touchpoints

| File | Firebase call | Supabase replacement |
|---|---|---|
| [`LoginForm.tsx`](../src/features/auth/components/LoginForm.tsx) `:48` | `signInWithEmailAndPassword` → `getIdToken()` | `supabase.auth.signInWithPassword({email,password})` → use `session.access_token` |
| [`ResetPasswordForm.tsx`](../src/features/auth/components/ResetPasswordForm.tsx) `:37` | `sendPasswordResetEmail` | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` |
| [`ProfilePage.tsx`](../src/features/profile/components/ProfilePage.tsx) `:269` | `updatePassword` + `reauthenticateWithCredential` | `supabase.auth.updateUser({ password })` (Supabase requires an active session, not a separate reauth credential — the reauth UI step can be simplified or kept as a confirm) |
| [`shell/components/Header.tsx`](../src/features/shell/components/Header.tsx) `:32` | `signOut` | `supabase.auth.signOut()` + call our `logoutAction` to clear cookies |
| [`components/dashboard/Header.tsx`](../src/components/dashboard/Header.tsx) `:6` | `signOut` | same as above |

### 4.3 Server-side touchpoints

| File | Firebase call | Supabase replacement |
|---|---|---|
| [`auth/actions/login.ts`](../src/features/auth/actions/login.ts) | `adminAuth.verifyIdToken(idToken)` | Verify the Supabase access token — `adminClient.auth.getUser(token)` (or verify the JWT with `JWT_SECRET`). Then the **rest of the action is unchanged**: look up `users` row, compose displayName, mint our cookies. |
| [`auth/actions/change-password.ts`](../src/features/auth/actions/change-password.ts) | `adminAuth.updateUser(uid, {password})` | `adminClient.auth.admin.updateUserById(uid, { password })` |
| [`auth/actions/manage-users.ts`](../src/features/auth/actions/manage-users.ts) | `createUser`, `updateUser`, `updateUser({disabled})`, `generatePasswordResetLink` | `auth.admin.createUser({email,password,...})`, `auth.admin.updateUserById(...)`, `auth.admin.updateUserById(uid,{ban_duration})` for deactivate, `auth.admin.generateLink({type:'recovery'\|'invite'})` |
| [`auth/queries/get-session-user.ts`](../src/features/auth/queries/get-session-user.ts) | (reads our cookies + DB) | **No change** — reads our own cookies and `users`/`staff` tables. |
| [`auth/actions/logout.ts`](../src/features/auth/actions/logout.ts), [`extend-session.ts`](../src/features/auth/actions/extend-session.ts) | cookie ops | **No change** (logout may additionally call `auth.admin.signOut` / revoke session — see security note below). |

### 4.4 Behavioural deltas to handle

- **User ID type (decision D1).** Firebase `uid` is stored as `users.id` (text) and used as the PK link everywhere. Supabase `auth.users.id` is a **UUID**. `createUserAction` currently does `users.insert({ id: created.uid })` — that keeps working since we copy whatever ID Supabase returns. The question is migrating *existing* accounts; with `USE_MOCK_DATA=true` and only seeded users today, the cheap path is to re-seed rather than remap. **`users.id` column stays `text`** (UUIDs fit fine), so no schema change is forced.
- **Deactivation semantics.** Firebase `disabled:true` → Supabase has no `disabled` flag; use `ban_duration` (e.g. `"876000h"`) or rely on our own `users.isActive=false` (already checked in `login.ts`). Lean on `isActive`; optionally also ban to block token refresh.
- **Token revocation on deactivate/role-change.** Deleting/disabling a user in Supabase does **not** invalidate existing access tokens. Because we re-check `users.isActive` and role from the DB on every request (in `get-session-user.ts` and `proxy.ts` reads the cookie), our app-layer check already covers this — but keep session lifetime short and consider `auth.admin.signOut(uid)` on deactivation.
- **GoTrue email sending.** Password-reset and invite emails are sent by GoTrue, not nodemailer, unless we wire GoTrue's SMTP to the same provider or route those flows through our own action + `src/lib/email.ts`. Decide per flow (see decision D4). On self-host, **GoTrue silently no-ops emails until SMTP env vars are set.**

### 4.5 Dependencies

- Remove `firebase`, `firebase-admin`.
- Add `@supabase/supabase-js`, `@supabase/ssr` (pin versions, commit lockfile).

---

## 5. Track C — Storage

Two buckets matching the current public-vs-private split:

- **`public-assets`** (public read): student/staff photos, school logo.
- **`documents`** (private, signed URLs only): lesson plans, schemes, assignments.

| File | Firebase call | Supabase replacement |
|---|---|---|
| [`src/lib/firebase-storage.ts`](../src/lib/firebase-storage.ts) | `uploadBytesResumable` + `getDownloadURL` | `supabase.storage.from(bucket).upload(path, file, { upsert })`; public URL via `getPublicUrl`. **`buildStoragePath()` is reusable as-is.** Note: Supabase JS upload has no granular progress callback like Firebase's resumable task — the `onProgress` UI affordance either drops to indeterminate or uses XHR/TUS resumable upload. |
| [`src/lib/storage-admin.ts`](../src/lib/storage-admin.ts) | `file.getSignedUrl({action:'read'})` | `adminClient.storage.from('documents').createSignedUrl(path, ttlSeconds)` |
| [`uploads/components/FileUploadField.tsx`](../src/features/uploads/components/FileUploadField.tsx), [`ImageUploadField.tsx`](../src/features/uploads/components/ImageUploadField.tsx) | consume `uploadFile()` | adapt to new upload signature / progress model |
| [`uploads/actions/sign-document.ts`](../src/features/uploads/actions/sign-document.ts) | calls `getSignedDownloadUrl` | unchanged signature, new impl underneath |
| [`profile/components/ProfilePage.tsx`](../src/features/profile/components/ProfilePage.tsx) | photo upload | adapt to new upload call |
| [`profile/actions/update-my-photo.ts`](../src/features/profile/actions/update-my-photo.ts), [`get-my-photo.ts`](../src/features/profile/queries/get-my-photo.ts) | store/fetch path | unchanged (still stores the path string) |

**Storage policies:** the private `documents` bucket needs RLS policies. Since uploads use **upsert**, grant **INSERT + SELECT + UPDATE** (a Supabase gotcha — INSERT-only makes replacement silently fail). If uploads/downloads go through the **service-role** client (server actions) rather than the browser anon client, they bypass Storage RLS — simplest path, consistent with our app-layer authz. Decide D2/D5.

---

## 6. Track D — Local dev environment

| Today | After |
|---|---|
| Firebase Auth Emulator (`:9099`) + Storage Emulator (`:9199`) | `supabase start` (local Supabase stack via CLI) **or** point dev at the Railway dev instance |
| Docker PG16 in [`docker-compose.yml`](../docker-compose.yml) (`:5436`) | Either keep Docker PG for pure DB work, or use the local Supabase Postgres — but auth/storage testing needs the Supabase stack running |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR`, `FIREBASE_AUTH_EMULATOR_HOST` | Removed; replaced by local Supabase URL + keys |

Add `supabase/config.toml` (created by `supabase init`) to pin local stack config and Edge Function definitions.

---

## 7. Track E — Edge Functions (full-stack inclusive)

The Railway template will include the Edge Functions runtime. **Important architectural note:** the app's mutations are Next.js Server Actions, and `CLAUDE.md` forbids API route handlers for mutations. **We do not rewrite Server Actions into Edge Functions** — that would contradict the architecture and create a parallel mutation path. Edge Functions are deployed and available, used only where logic genuinely belongs *outside* the Next.js request lifecycle.

Concrete candidates in this app (each optional, build when needed — YAGNI):

| Use case | Why an Edge Function / DB primitive | Touches |
|---|---|---|
| **Auth email branding** | GoTrue "Send Email" hook → call our nodemailer/templates so reset/invite emails match the school brand | new `supabase/functions/auth-email/`, GoTrue hook config |
| **Sync new auth users → `users` table** | A GoTrue "after user created" hook or Postgres trigger, if any signups bypass `createUserAction` | DB trigger or function |
| **Scheduled jobs** | `pg_cron` (Supabase extension) invoking a function: notification digests, session/token cleanup, promotion-season transitions | `pg_cron` + function |
| **Storage post-processing** | Resize/optimise uploaded photos | function + storage webhook |

Setup per function: `supabase/functions/<name>/index.ts` (Deno/TypeScript), entry in `config.toml`, function secrets, deploy via Supabase CLI / Railway edge-runtime service. **None are required for feature parity** — they're the upside of having the full stack. Recommend deferring all until a concrete need (the email hook is the most likely first one).

---

## 8. Track F — Railway infrastructure

Deploy via Railway template (user is handling this). Full stack incl. Functions:

- Use the full Supabase template (`supabase-firebase-alternative` includes Auth, APIs, Functions, Realtime). The plain `supabase` template **excludes Functions/Logflare** — pick the Functions-inclusive one since Functions are in scope.
- **Persistent volumes** on both the Postgres service and the Storage service, or redeploys wipe data/files.
- **Rotate the template's default secrets** before any real data: `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, dashboard password, Postgres password.
- **Wire SMTP into GoTrue** or auth emails silently fail.

### Environment variable migration

Remove (Firebase):
```
NEXT_PUBLIC_FIREBASE_API_KEY / AUTH_DOMAIN / PROJECT_ID / STORAGE_BUCKET / MESSAGING_SENDER_ID / APP_ID
FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY
NEXT_PUBLIC_USE_FIREBASE_EMULATOR / FIREBASE_AUTH_EMULATOR_HOST
DB_DRIVER
```
Add (Supabase):
```
NEXT_PUBLIC_SUPABASE_URL        # Kong/API gateway public URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # publishable/anon key (browser)
SUPABASE_SERVICE_ROLE_KEY       # server-only, never NEXT_PUBLIC_
SUPABASE_JWT_SECRET             # if verifying tokens server-side in login.ts
DATABASE_URL                    # Supabase direct Postgres URL (migrations)
DATABASE_POOLER_URL             # optional: pooled URL for app runtime
```
Keep unchanged: `SMTP_*`, `EMAIL_FROM`, `EMAIL_DEV_REDIRECT`, `APP_URL`.
Update [`.env.local.example`](../.env.local.example) to reflect the new set.

---

## 9. Seed scripts & tests

| File | Change |
|---|---|
| [`scripts/seed-emulator-users.ts`](../scripts/seed-emulator-users.ts) | Rewrite against Supabase admin API (or local Supabase) instead of Firebase emulator |
| `scripts/seed-firebase-users.ts` | Replace with `seed-supabase-users.ts`; update `seed:firebase` npm script |
| [`tests/setup-test-db.ts`](../tests/setup-test-db.ts), [`tests/e2e/setup-db.ts`](../tests/e2e/setup-db.ts) | DB setup unchanged (still Postgres); auth fixtures change if E2E exercises real login |
| Playwright E2E login flow | Update to drive Supabase login instead of Firebase |
| `package.json` scripts | `seed:emulator` / `seed:firebase` renamed; drop Firebase emulator references |

---

## 10. Decision points (resolve before implementing)

- **D1 — User ID strategy.** Re-seed accounts with Supabase UUIDs (cheap, recommended given mock-data state) vs. remap existing identities. `users.id` stays `text`.
- **D2 — Authorization model.** Keep app-layer `schoolId` enforcement via service-role server access (recommended — least churn, matches current design) vs. adopt PostgREST + RLS as a real access path. If staying app-layer, **lock down the Data API** (don't expose `public` tables to `anon`/`authenticated`).
- **D3 — Session model.** Keep our custom cookies (recommended — `proxy.ts` and `get-session-user.ts` already depend on them) vs. migrate to Supabase SSR session cookies. Keeping ours means Supabase is purely the credential/identity store.
- **D4 — Auth emails.** Route reset/invite through our own actions + `src/lib/email.ts` (full brand control) vs. GoTrue's built-in templates over our SMTP.
- **D5 — Storage access path.** Server-side (service-role) uploads/downloads (recommended — no Storage RLS needed) vs. direct browser uploads with anon key + Storage policies.
- **D6 — Edge Functions scope.** Defer all (recommended) vs. build the auth-email hook now.

---

## 11. Suggested phasing & effort

| Phase | Scope | Effort | Gate |
|---|---|---|---|
| 0 | Stand up Railway Supabase (Functions-inclusive), capture secrets, rotate defaults | (user) | Stack reachable |
| 1 | **DB re-point** — driver simplification, `DATABASE_URL` swap, run migrations, full Vitest pass | ~0.5 day | All tests green on Supabase Postgres |
| 2 | **Auth** — Supabase client/admin setup, rewrite 8 touchpoints, re-seed users, login/reset/change-password E2E | 3–5 days | Login + role routing works for all 4 roles |
| 3 | **Storage** — buckets + policies, rewrite upload/sign libs + 4 consumers, photo/document flows | 2–3 days | Upload + signed download works |
| 4 | **Cleanup** — remove Firebase deps, env, emulator scripts; update `.env.example`, `DEPLOY.md`, `CLAUDE.md` | 1 day | No `firebase` imports remain |
| 5 | **Edge Functions** (optional) — auth-email hook first | 1–2 days each | Per-function |

**Estimate: ~2 weeks** for parity (phases 1–4), excluding optional Edge Functions.

---

## 12. Top risks

1. **User ID remapping** if real accounts exist — cheapest to migrate now while on mock data.
2. **GoTrue SMTP not configured** → silent auth-email failures on self-host. Verify early.
3. **Missing persistent volumes** on Railway → data/file loss on redeploy.
4. **Upload progress UX regression** — Supabase JS upload lacks Firebase's resumable progress callback; decide indeterminate spinner vs. TUS resumable.
5. **Default template secrets** left unrotated → exposed `service_role` = full DB access.
6. **Data API exposure** — if `public` tables are reachable via PostgREST with the anon key and RLS is off, every table is world-readable. Lock down or enable RLS (ties to D2).

---

## 13. Docs to update on completion

- [`CLAUDE.md`](../CLAUDE.md) — Database/Auth/Mock-data sections, Key Files table.
- [`docs/DEPLOY.md`](DEPLOY.md) — Railway Supabase deploy steps, env vars.
- [`docs/ENGINEERING-CONVENTIONS.md`](ENGINEERING-CONVENTIONS.md) — auth/storage conventions.
- [`.env.local.example`](../.env.local.example) — new env set.
