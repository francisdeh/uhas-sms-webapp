/**
 * Seeds a Supabase project's `auth.users` with one user per role.
 *
 * Mirrors what scripts/seed-firebase-users.ts used to do, but for
 * Supabase Auth. Each user gets:
 *   - A pinned UUID (so the `users` bridge table can FK back to it)
 *   - app_metadata.{role, school_id, linked_id} — the privileged claims
 *     the proxy + FastAPI read from the JWT. NEVER set in user_metadata.
 *   - A password (for email-login accounts) and/or a phone (for OTP)
 *   - mustChangePassword cleared (admin can flip it later via the UI)
 *
 * Usage:
 *   npm run seed:supabase                 # additive: create missing, update metadata
 *   npm run seed:supabase -- --force      # also reset password + phone on existing
 *   npm run seed:supabase -- --prune      # delete users not in mockUsers
 *   npm run seed:supabase -- --dry-run    # show plan, write nothing
 *
 * Requires env (loaded from .env.local or .env.seed):
 *   NEXT_PUBLIC_SUPABASE_URL       (defaults to local CLI: http://127.0.0.1:54321)
 *   SUPABASE_SERVICE_ROLE_KEY      (NEVER commit this — service role bypasses RLS)
 *
 * For the local Supabase CLI stack, the service_role key is the well-known
 * value printed by `supabase status`. Copy it into .env.local once.
 */

import { createClient, type AuthError, type User } from "@supabase/supabase-js";

import { det } from "./_seed-data/_uuid";
import { mockUsers, type SeedUser } from "./_seed-data/users";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const PRUNE = args.has("--prune");
const DRY = args.has("--dry-run");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY. For local dev, run `supabase status` and copy the service_role key into .env.local."
  );
  process.exit(1);
}

// Both claims are the det() UUIDs of the rows in the public schema.
// Matches what seed-db.ts produces and what FastAPI deps read.
const SCHOOL_UUID = det("school-uhas-001");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function appMetadataFor(user: SeedUser) {
  return {
    role: user.role,
    school_id: SCHOOL_UUID,
    linked_id: det(user.linkedId),
  };
}

function userMetadataFor(user: SeedUser) {
  return {
    display_name: user.displayName,
    must_change_password: false,
  };
}

async function findExisting(uid: string): Promise<User | null> {
  const { data, error } = await supabase.auth.admin.getUserById(uid);
  if (error) {
    // Supabase returns 404 for missing users — treat as "not found".
    if (error.status === 404) return null;
    throw error;
  }
  return data.user ?? null;
}

async function listAllUsers(): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

async function seedOne(user: SeedUser): Promise<void> {
  const label = user.role.padEnd(12);
  const existing = await findExisting(user.uid);

  if (existing) {
    console.log(`- exists   ${label} ${user.email}  (uid: ${user.uid})`);

    const updates: Parameters<typeof supabase.auth.admin.updateUserById>[1] = {
      email: user.email,
      phone: user.phone,
      email_confirm: true,
      phone_confirm: Boolean(user.phone),
      app_metadata: appMetadataFor(user),
      user_metadata: userMetadataFor(user),
    };
    if (FORCE) {
      updates.password = user.password;
    }

    if (DRY) {
      console.log(`  ↳ would update metadata + ${FORCE ? "password" : "(skip password — use --force)"}`);
      return;
    }

    const { error } = await supabase.auth.admin.updateUserById(user.uid, updates);
    if (error) throw error;
    console.log(`  ↳ updated  metadata + ${FORCE ? "password" : "(no password change)"}`);
    return;
  }

  if (DRY) {
    console.log(`+ would create  ${label} ${user.email}  (uid: ${user.uid})`);
    return;
  }

  const { error } = await supabase.auth.admin.createUser({
    // Pinning the UUID is what makes our `users.id` bridge work — without
    // this Supabase mints a random UUID and the FK chain breaks.
    id: user.uid,
    email: user.email,
    phone: user.phone,
    password: user.password,
    email_confirm: true,
    phone_confirm: Boolean(user.phone),
    app_metadata: appMetadataFor(user),
    user_metadata: userMetadataFor(user),
  });
  if (error) throw error;
  console.log(`✓ created  ${label} ${user.email}  (uid: ${user.uid})`);
}

async function prune(): Promise<void> {
  console.log("\nScanning for orphans not in mockUsers...");
  const all = await listAllUsers();
  const seededIds = new Set(mockUsers.map((u) => u.uid));
  const orphans = all.filter((u) => !seededIds.has(u.id));

  if (orphans.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const u of orphans) {
    const label = u.email ?? u.phone ?? "(no identifier)";
    if (DRY) {
      console.log(`- would delete  ${label}  (uid: ${u.id})`);
      continue;
    }
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      console.error(`✗ delete failed  ${label}:`, error.message);
      continue;
    }
    console.log(`✗ deleted  ${label}  (uid: ${u.id})`);
  }
}

async function main() {
  const flagSummary = [FORCE && "--force", PRUNE && "--prune", DRY && "--dry-run"]
    .filter(Boolean)
    .join(" ");
  console.log(
    `Seeding Supabase Auth: ${SUPABASE_URL}${flagSummary ? `  (${flagSummary})` : ""}\n`,
  );

  for (const user of mockUsers) {
    try {
      await seedOne(user);
    } catch (err) {
      const authErr = err as AuthError;
      console.error(`✗ failed   ${user.email}:`, authErr.message ?? err);
    }
  }

  if (PRUNE) {
    await prune();
  }

  console.log(DRY ? "\nDry-run complete — no changes written." : "\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
