/**
 * Seeds a real Firebase project with one user per role and sets custom claims.
 *
 * Usage:
 *   npm run seed:firebase                  # additive: create missing, set claims on existing
 *   npm run seed:firebase -- --force       # also update password + displayName on existing
 *   npm run seed:firebase -- --prune       # also delete users not in mockUsers
 *   npm run seed:firebase -- --force --prune
 *   npm run seed:firebase -- --dry-run     # show what would change without writing
 *
 * Requires these env vars (loaded from .env.seed):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { mockUsers } from "../src/lib/mock/users";

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");
const PRUNE = args.has("--prune");
const DRY = args.has("--dry-run");

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error(
    "Missing required env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
  );
  process.exit(1);
}

const app = initializeApp({
  credential: cert({ projectId, clientEmail, privateKey }),
});

const auth = getAuth(app);

const flagSummary = [
  FORCE ? "--force" : null,
  PRUNE ? "--prune" : null,
  DRY ? "--dry-run" : null,
]
  .filter(Boolean)
  .join(" ");

async function seed() {
  console.log(
    `Seeding Firebase project: ${projectId}${flagSummary ? `  (${flagSummary})` : ""}\n`
  );

  const seededEmails = new Set(mockUsers.map((u) => u.email.toLowerCase()));

  for (const user of mockUsers) {
    let uid: string;
    let isExisting = false;

    try {
      if (DRY) {
        await auth.getUserByEmail(user.email);
        uid = "(dry-run)";
        isExisting = true;
        console.log(`- would update  ${user.role.padEnd(12)} ${user.email}`);
      } else {
        const created = await auth.createUser({
          email: user.email,
          password: user.password,
          displayName: user.displayName,
          emailVerified: true,
        });
        uid = created.uid;
        console.log(`✓ created  ${user.role.padEnd(12)} ${user.email}  (uid: ${uid})`);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (DRY && code === "auth/user-not-found") {
        console.log(`+ would create  ${user.role.padEnd(12)} ${user.email}`);
        continue;
      } else if (code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(user.email);
        uid = existing.uid;
        isExisting = true;
        console.log(`- exists   ${user.role.padEnd(12)} ${user.email}  (uid: ${uid})`);
      } else {
        console.error(`✗ failed   ${user.email}:`, err);
        continue;
      }
    }

    if (isExisting && FORCE && !DRY) {
      await auth.updateUser(uid, {
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });
      console.log(`  ↳ updated password + displayName`);
    } else if (isExisting && FORCE && DRY) {
      console.log(`  ↳ would update password + displayName`);
    }

    if (!DRY) {
      await auth.setCustomUserClaims(uid, {
        role: user.role,
        linkedId: user.linkedId,
      });
      console.log(`  ↳ claims set  role=${user.role}  linkedId=${user.linkedId}`);
    } else {
      console.log(`  ↳ would set claims  role=${user.role}  linkedId=${user.linkedId}`);
    }
  }

  if (PRUNE) {
    console.log("\nScanning for orphans not in mockUsers...");
    let nextPageToken: string | undefined;
    const orphans: { uid: string; email: string }[] = [];
    do {
      const page = await auth.listUsers(1000, nextPageToken);
      for (const u of page.users) {
        const email = u.email?.toLowerCase();
        if (email && !seededEmails.has(email)) {
          orphans.push({ uid: u.uid, email: u.email! });
        }
      }
      nextPageToken = page.pageToken;
    } while (nextPageToken);

    if (orphans.length === 0) {
      console.log("  (none)");
    } else {
      for (const o of orphans) {
        if (DRY) {
          console.log(`- would delete  ${o.email}  (uid: ${o.uid})`);
        } else {
          await auth.deleteUser(o.uid);
          console.log(`✗ deleted  ${o.email}  (uid: ${o.uid})`);
        }
      }
    }
  }

  console.log(DRY ? "\nDry-run complete — no changes written." : "\nDone.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
