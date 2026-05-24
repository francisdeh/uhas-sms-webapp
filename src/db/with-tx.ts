import { db } from "@/db";

export type DbClient = typeof db;

// Drizzle transaction handles share the same query/insert/update/delete
// surface as the top-level `db` client, but their concrete types differ —
// `tx` from `db.transaction(async (tx) => …)` does not narrow to `typeof
// db` even though every method we use exists on both.
//
// Helpers that need either (e.g. `writeAuditLog`, `upsertRemark`) accept
// `DbClient`; call sites inside a transaction pass `asDbClient(tx)` to
// widen at the boundary. One cast, documented, contained.
//
// Replaces scattered `tx as unknown as typeof db` casts.
export function asDbClient<T>(tx: T): DbClient {
  return tx as unknown as DbClient;
}
