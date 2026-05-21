// Per-file DB reset helper.
//
// Use in integration tests:
//   beforeAll(async () => { await resetDb(); });
//
// Truncates every table in dependency order, then re-runs the canonical seed
// (the same one `npm run db:seed` uses). Cost: ~1-2 sec per file on Docker
// Postgres. Acceptable when tests within a file share the seed snapshot.

import { execSync } from "node:child_process";
import { Pool } from "pg";

const TABLES_IN_TRUNCATE_ORDER = [
  "audit_log",
  "promotion_decisions",
  "promotion_submissions",
  "promotion_seasons",
  "appointments",
  "calendar_events",
  "announcements",
  "assignments",
  "schemes",
  "lesson_plans",
  "leave_requests",
  "staff_attendance_records",
  "staff_attendance_sessions",
  "attendance_records",
  "attendance_sessions",
  "student_report_remarks",
  "class_report_submissions",
  "scores",
  "exams",
  "enrollments",
  "class_subjects",
  "class_teachers",
  "subjects",
  "classes",
  "student_guardians",
  "guardians",
  "students",
  "users",
  "staff",
  "schools",
];

let seeded = false;

export async function resetDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set — make sure .env.test is loaded");
  if (!url.includes("_test")) {
    throw new Error(`Refusing to reset non-test database: ${url}`);
  }

  const pool = new Pool({ connectionString: url });
  try {
    for (const table of TABLES_IN_TRUNCATE_ORDER) {
      await pool.query(`TRUNCATE TABLE "${table}" CASCADE`);
    }
  } finally {
    await pool.end();
  }

  // First call also runs the seed; subsequent calls just truncate + reseed
  // by shelling out to the existing script (one source of truth for fixtures).
  execSync("tsx scripts/seed-db.ts", {
    stdio: seeded ? "ignore" : "inherit",
    env: { ...process.env },
  });
  seeded = true;
}
