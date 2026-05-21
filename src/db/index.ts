import * as schema from "./schema";

type DbDriver = "pg" | "neon-http";

function resolveDriver(): DbDriver {
  const explicit = process.env.DB_DRIVER as DbDriver | undefined;
  if (explicit === "pg" || explicit === "neon-http") return explicit;
  // Default to `pg` everywhere. `neon-http` is HTTP-only and doesn't
  // support transactions — only opt in via env var when the deploy
  // target is a serverless/edge runtime (Vercel Edge, Cloudflare Workers)
  // where TCP pools aren't possible. Railway holds a normal Node process
  // so the standard pg driver against Neon is both correct + cheaper.
  return "pg";
}

type SchemaT = typeof schema;
type DbInstance =
  | import("drizzle-orm/neon-http").NeonHttpDatabase<SchemaT>
  | import("drizzle-orm/node-postgres").NodePgDatabase<SchemaT>;

let _db: DbInstance | undefined;

function makeNeon(url: string): DbInstance {
  const { neon } = require("@neondatabase/serverless");
  const { drizzle } = require("drizzle-orm/neon-http");
  return drizzle(neon(url), { schema });
}

function makePg(url: string): DbInstance {
  const { Pool } = require("pg");
  const { drizzle } = require("drizzle-orm/node-postgres");
  // Lazy module-level cache survives Next.js HMR; the Pool can stay open.
  return drizzle(new Pool({ connectionString: url }), { schema });
}

export function getDb(): DbInstance {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _db = resolveDriver() === "neon-http" ? makeNeon(url) : makePg(url);
  return _db;
}

export const db = new Proxy({} as DbInstance, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop as string];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
