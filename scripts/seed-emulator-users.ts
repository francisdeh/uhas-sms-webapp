/**
 * Seeds the Firebase Auth Emulator with one test user per role.
 * Run with: npx tsx scripts/seed-emulator-users.ts
 * Requires the emulator to be running: firebase emulators:start
 */

import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { mockUsers } from "../src/lib/mock/users";

const app = initializeApp({
  apiKey: "demo-api-key",
  authDomain: "demo-project.firebaseapp.com",
  projectId: "demo-project",
});

const auth = getAuth(app);
connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });

async function seed() {
  console.log("Seeding Firebase Auth Emulator...\n");

  for (const user of mockUsers) {
    try {
      const { user: created } = await createUserWithEmailAndPassword(auth, user.email, user.password);
      await updateProfile(created, { displayName: user.displayName });
      console.log(`✓ ${user.role.padEnd(12)} ${user.email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("EMAIL_EXISTS") || msg.includes("email-already-in-use")) {
        console.log(`- ${user.role.padEnd(12)} ${user.email}  (already exists)`);
      } else {
        console.error(`✗ ${user.email}: ${msg}`);
      }
    }
  }

  console.log("\nDone. Emulator UI: http://localhost:4000");
}

seed();
