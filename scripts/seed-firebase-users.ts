/**
 * Seeds a real Firebase project with one user per role and sets custom claims.
 *
 * Run once after creating your Firebase project:
 *   npx tsx scripts/seed-firebase-users.ts
 *
 * Requires these env vars (from your Firebase service account JSON):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * Load them from a local file:
 *   FIREBASE_PROJECT_ID=xxx FIREBASE_CLIENT_EMAIL=yyy FIREBASE_PRIVATE_KEY=zzz \
 *     npx tsx scripts/seed-firebase-users.ts
 *
 * Or create a .env.seed file and run:
 *   npx dotenv -e .env.seed -- npx tsx scripts/seed-firebase-users.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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

const users = [
  {
    email: "admin@uhas.edu.gh",
    password: "Admin@1234",
    displayName: "Emmanuel Asante",
    role: "Admin",
    linkedId: "STAFF-001",
  },
  {
    email: "dh.jhs@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Abena Mensah",
    role: "DeputyHead",
    linkedId: "STAFF-002",
  },
  {
    email: "dh.primary@uhas.edu.gh",
    password: "Deputy@1234",
    displayName: "Kofi Boateng",
    role: "DeputyHead",
    linkedId: "STAFF-003",
  },
  {
    email: "hod@uhas.edu.gh",
    password: "HOD@12345",
    displayName: "Ama Owusu",
    role: "HOD",
    linkedId: "STAFF-004",
  },
  {
    email: "teacher@uhas.edu.gh",
    password: "Teacher@1234",
    displayName: "Kwame Darko",
    role: "Teacher",
    linkedId: "STAFF-005",
  },
  {
    email: "parent@uhas.edu.gh",
    password: "Parent@1234",
    displayName: "Yaw Boateng",
    role: "Parent",
    linkedId: "guardian-001",
  },
];

async function seed() {
  console.log(`Seeding Firebase project: ${projectId}\n`);

  for (const user of users) {
    let uid: string;

    try {
      const created = await auth.createUser({
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });
      uid = created.uid;
      console.log(`✓ created  ${user.role.padEnd(12)} ${user.email}  (uid: ${uid})`);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/email-already-exists") {
        const existing = await auth.getUserByEmail(user.email);
        uid = existing.uid;
        console.log(`- exists   ${user.role.padEnd(12)} ${user.email}  (uid: ${uid})`);
      } else {
        console.error(`✗ failed   ${user.email}:`, err);
        continue;
      }
    }

    await auth.setCustomUserClaims(uid, {
      role: user.role,
      linkedId: user.linkedId,
    });
    console.log(`  ↳ claims set  role=${user.role}  linkedId=${user.linkedId}`);
  }

  console.log("\nDone.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
