/**
 * Seeds the Firebase Auth Emulator with one test user per role.
 * UIDs are pulled from the `users` table in the DB (populated by `npm run db:seed`).
 *
 * Run with: npx tsx scripts/seed-emulator-users.ts
 * Requires the emulator to be running: firebase emulators:start
 */

// Must be set before firebase-admin initialises so it points at the emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

import { config } from "dotenv";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";

config({ path: ".env.local" });
config({ path: ".env" });

// Default passwords by role — used when seeding fresh accounts in the
// emulator. Matches the test-account table in README.md.
const DEFAULT_PASSWORDS: Record<string, string> = {
  Admin: "Admin@1234",
  DeputyHead: "Deputy@1234",
  Teacher: "Teacher@1234",
  Parent: "Parent@1234",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });

  const auth = getAuth(initializeApp({ projectId: "uhas-sms-dev" }));

  console.log("Seeding Firebase Auth Emulator from DB users…\n");

  const users = await db.query.users.findMany();
  if (users.length === 0) {
    console.log("No users found in DB. Run `npm run db:seed` first.");
    await pool.end();
    return;
  }

  // Look up displayName from staff (or fall back to email)
  for (const u of users) {
    let displayName = "";
    if (u.linkedId) {
      const staffRow = await db.query.staff.findFirst({
        where: eq(schema.staff.id, u.linkedId),
      });
      if (staffRow) displayName = `${staffRow.firstName} ${staffRow.lastName}`;
    }

    const password = DEFAULT_PASSWORDS[u.role] ?? "Default@1234";
    const role = (u.role ?? "Teacher").padEnd(12);

    try {
      await auth.createUser({
        uid: u.id,
        email: u.email,
        password,
        displayName,
        emailVerified: true,
      });
      console.log(`✓ ${role} ${u.email}  (uid: ${u.id})`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/uid-already-exists" || code === "auth/email-already-exists") {
        console.log(`- ${role} ${u.email}  (already exists — skipped)`);
      } else {
        console.error(`✗ ${u.email}:`, err);
      }
    }
  }

  await pool.end();
  console.log("\nDone. Emulator UI → http://localhost:4000");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
