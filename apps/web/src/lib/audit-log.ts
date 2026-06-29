import { auditLog } from "@/db/schema";
import { db } from "@/db";
import { getCurrentSchoolId } from "@/lib/school";

export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED"
  | "SCHOOL_SETTINGS_UPDATE";

// Reserved UUID for system-originated audit rows (no human actor) —
// e.g. background jobs, seed scripts, the `?? "system"` fallback when
// an action didn't resolve a session. Fixed all-zero v0-ish UUID so
// it sorts to the top and is unambiguously "not a real user".
const SYSTEM_ACTOR_UUID = "00000000-0000-0000-0000-000000000000";

// Drizzle's transaction handle types differ by driver, so we type-erase to a
// minimal shape we use here. Either `db` or a `tx` handle works.
type Insertable = {
  insert: typeof db.insert;
};

export async function writeAuditLog(
  client: Insertable,
  input: {
    userId: string;
    action: AuditAction;
    targetTable: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
  }
) {
  // Translate the legacy "system" sentinel to the reserved UUID — both
  // user_id and target_id are uuid columns now and Postgres won't cast
  // "system" to a uuid at runtime.
  const userId = input.userId === "system" ? SYSTEM_ACTOR_UUID : input.userId;

  await client.insert(auditLog).values({
    schoolId: await getCurrentSchoolId(),
    userId,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId,
    before: input.before ? JSON.stringify(input.before) : null,
    after: input.after ? JSON.stringify(input.after) : null,
  });
}
