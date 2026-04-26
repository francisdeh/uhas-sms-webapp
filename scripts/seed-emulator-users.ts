/**
 * Seeds the Firebase Auth Emulator with one test user per role.
 * Uses the Admin SDK so UIDs match the hardcoded values in src/lib/mock/users.ts.
 *
 * Run with: npx tsx scripts/seed-emulator-users.ts
 * Requires the emulator to be running: firebase emulators:start
 */

// Must be set before firebase-admin initialises so it points at the emulator
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mockUsers } from "../src/lib/mock/users";

const auth = getAuth(initializeApp({ projectId: "uhas-sms-dev" }));

async function seed() {
  console.log("Seeding Firebase Auth Emulator…\n");

  for (const user of mockUsers) {
    try {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });
      console.log(`✓ ${user.role.padEnd(12)} ${user.email}  (uid: ${user.uid})`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/uid-already-exists" || code === "auth/email-already-exists") {
        console.log(`- ${user.role.padEnd(12)} ${user.email}  (already exists — skipped)`);
      } else {
        console.error(`✗ ${user.email}:`, err);
      }
    }
  }

  console.log("\nDone. Emulator UI → http://localhost:4000");
}

seed();
