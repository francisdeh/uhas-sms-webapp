// Applies pending Drizzle migrations against DATABASE_URL.
// Run with: npm run db:migrate

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  console.log(`Migrating ${redact(url)}…`);
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("✓ Migrations applied");
}

function redact(url: string): string {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
