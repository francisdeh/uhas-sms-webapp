// One-shot: ensure uhas_sms_test exists and has the latest schema.
// Run with: npm run db:test:setup

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.test" });

const TEST_DB_NAME = "uhas_sms_test";
// Connect to the default 'postgres' DB to create the test DB if missing.
const ADMIN_URL =
  process.env.DATABASE_URL!.replace(/\/[^/]+$/, "/postgres");

async function main() {
  console.log("Setting up test DB…");

  // 1. Create the test DB if it doesn't exist
  const adminPool = new Pool({ connectionString: ADMIN_URL });
  try {
    const existing = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME]
    );
    if (existing.rowCount === 0) {
      await adminPool.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
      console.log(`  ✓ Created database ${TEST_DB_NAME}`);
    } else {
      console.log(`  - Database ${TEST_DB_NAME} already exists`);
    }
  } finally {
    await adminPool.end();
  }

  // 2. Run migrations against it
  const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(testPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("  ✓ Migrations applied");
  } finally {
    await testPool.end();
  }

  console.log("Test DB ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
