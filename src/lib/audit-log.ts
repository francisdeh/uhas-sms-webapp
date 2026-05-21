import { auditLog } from "@/db/schema";
import { db } from "@/db";
import { getCurrentSchoolId } from "@/lib/school";

export type AuditAction =
  | "SCORE_OVERRIDE"
  | "STUDENT_EDIT"
  | "ROLE_CHANGE"
  | "PROMOTION_APPROVED"
  | "SCHOOL_SETTINGS_UPDATE";

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
  await client.insert(auditLog).values({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    schoolId: await getCurrentSchoolId(),
    userId: input.userId,
    action: input.action,
    targetTable: input.targetTable,
    targetId: input.targetId,
    before: input.before ? JSON.stringify(input.before) : null,
    after: input.after ? JSON.stringify(input.after) : null,
  });
}
