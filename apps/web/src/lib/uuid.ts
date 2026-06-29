/**
 * Deterministic UUID generator.
 *
 * Every fixture row's UUID is derived from a stable string key (typically
 * the row's old semantic id — "STAFF-001", "school-uhas-001", etc.).
 * Same input → same UUID, across runs, machines, and CI.
 *
 * Used by:
 *   - Seed fixtures (apps/web/scripts/_seed-data/*) — pin the UUID for
 *     each known entity so cross-fixture FKs resolve without manual maps.
 *   - Test helpers (tests/setup.ts) — sign in as "STAFF-001" without
 *     discovering the UUID at runtime.
 *   - Production code (e.g. src/lib/school.ts) — resolve the seeded
 *     school's UUID from its slug.
 *
 * The UUID this produces is RFC-4122 v5-shaped (version + variant bits
 * set) but the namespace is project-specific, not a real v5 namespace.
 * That's fine for seed data — these UUIDs never collide with externally
 * generated ones because the namespace string is unique.
 */

import { createHash } from "node:crypto";

const NAMESPACE = "uhas-sms-seed-v1";

/**
 * Returns a deterministic UUID for the given key.
 *
 * Use the row's old semantic id as the key — "STAFF-001",
 * "school-uhas-001", "class-jhs1", etc. New entities pick any unique
 * stable string.
 */
export function det(key: string): string {
  const hash = createHash("sha256").update(`${NAMESPACE}:${key}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}
