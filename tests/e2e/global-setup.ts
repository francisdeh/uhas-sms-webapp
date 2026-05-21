// Runs once before all Playwright specs.
//
// 1. Verifies the Firebase Auth Emulator is reachable.
// 2. Resets + seeds the E2E database (uhas_sms_e2e).
// 3. Seeds the Firebase Auth Emulator with the seeded users.
// 4. Logs into the Next.js dev server (port 3100) as each role via the real
//    UI, saves the resulting cookies as storage state files. Specs then
//    `test.use({ storageState })` to start authenticated.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

type RoleSpec = {
  key: string;
  email: string;
  password: string;
  expectedRedirect: string;
};

const ROLES: RoleSpec[] = [
  { key: "admin", email: "admin@uhas.edu.gh", password: "Admin@1234", expectedRedirect: "/admin" },
  { key: "deputy-head-jhs", email: "dh.jhs@uhas.edu.gh", password: "Deputy@1234", expectedRedirect: "/deputy-head" },
  { key: "deputy-head-upper-primary", email: "dh.upper-primary@uhas.edu.gh", password: "Deputy@1234", expectedRedirect: "/deputy-head" },
  { key: "unit-head-jhs", email: "unit-head.jhs@uhas.edu.gh", password: "Teacher@1234", expectedRedirect: "/teacher" },
  { key: "teacher", email: "teacher@uhas.edu.gh", password: "Teacher@1234", expectedRedirect: "/teacher" },
  { key: "parent", email: "parent@uhas.edu.gh", password: "Parent@1234", expectedRedirect: "/parent" },
];

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3100";

  // 1. Firebase emulator reachability check
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "localhost:9099";
  try {
    const res = await fetch(`http://${emulatorHost}/`);
    if (!res.ok && res.status !== 404) {
      throw new Error(`emulator returned ${res.status}`);
    }
  } catch (err) {
    throw new Error(
      `Firebase Auth Emulator not reachable at http://${emulatorHost}. ` +
        `Start it with \`firebase emulators:start\` before running E2E. (${(err as Error).message})`
    );
  }

  // 2. Reset + seed the E2E database
  console.log("[e2e setup] Resetting + seeding database…");
  execSync("npx tsx scripts/seed-db.ts --reset", {
    stdio: "inherit",
    env: { ...process.env },
  });

  // 3. Seed Firebase Auth Emulator from the now-fresh DB
  console.log("[e2e setup] Seeding Firebase Auth Emulator…");
  // The seeder is idempotent — skips users that already exist in the emulator.
  // Run with FIREBASE_AUTH_EMULATOR_HOST already set by .env.e2e.
  execSync("npx tsx scripts/seed-emulator-users.ts", {
    stdio: "inherit",
    env: { ...process.env },
  });

  // 4. Log in as each role, save storage state
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const role of ROLES) {
      const MAX_ATTEMPTS = 3;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const tag = attempt === 1 ? "" : ` (retry ${attempt - 1})`;
        console.log(`[e2e setup] Logging in as ${role.key}…${tag}`);
        const context = await browser.newContext();
        const page = await context.newPage();
        page.on("pageerror", (err) => {
          console.log(`  [${role.key} pageerror]`, err.message);
        });
        try {
          await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
          // Wait until React 18 has hydrated the form. Without this, the
          // click can race onSubmit binding and the browser falls back to
          // a plain GET. React attaches __reactProps$<id> to any DOM node
          // it manages — its presence on <form> means onSubmit is wired.
          await page.waitForFunction(
            () => {
              const form = document.querySelector("form");
              return !!form && Object.keys(form).some((k) => k.startsWith("__reactProps"));
            },
            undefined,
            { timeout: 15_000 }
          );
          await page.getByLabel(/email/i).fill(role.email);
          await page.getByLabel(/password/i).fill(role.password);
          await page.getByRole("button", { name: /sign in/i }).click();
          await page.waitForURL(new RegExp(`${role.expectedRedirect}(\\?.*)?$`), {
            timeout: 45_000,
          });

          const statePath = path.join(FIXTURES_DIR, `${role.key}.json`);
          await context.storageState({ path: statePath });
          await context.close();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          console.error(
            `  [${role.key}] attempt ${attempt} failed at URL=${page.url()}: ${(err as Error).message.split("\n")[0]}`
          );
          await context.close();
          // Brief pause so the dev server can recover from a bad chunk.
          await new Promise((r) => setTimeout(r, 2_000));
        }
      }
      if (lastErr) throw lastErr;
    }
  } finally {
    await browser.close();
  }

  console.log("[e2e setup] Ready.");
}

export default globalSetup;
