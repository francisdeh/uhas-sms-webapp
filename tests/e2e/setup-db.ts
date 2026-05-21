// One-shot: ensure uhas_sms_e2e exists and has the latest schema.
// Run with: npm run db:e2e:setup

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.e2e" });

const TEST_DB_NAME = "uhas_sms_e2e";
const ADMIN_URL = process.env.DATABASE_URL!.replace(/\/[^/]+$/, "/postgres");

async function main() {
  console.log("Setting up E2E DB…");

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

  const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(testPool);
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("  ✓ Migrations applied");
  } finally {
    await testPool.end();
  }

  console.log("E2E DB ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
