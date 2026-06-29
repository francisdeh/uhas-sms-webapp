"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { writeAuditLog } from "@/lib/audit-log";
import { SCHOOL_SETTINGS_TAG } from "@/features/settings/queries/get-school-settings";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import type { ActionResult } from "@/lib/action-result";

// Shared write path for every settings tab. Reads the current row,
// applies the patch, writes an audit_log row with field-level before/after.
//
// Revalidates the settings page + every route that depends on a school
// setting (currently: dashboard layout for the logo + name, login page for
// the logo). Callers don't need to revalidate themselves.
export async function applySchoolSettingsPatch<T extends Partial<typeof schools.$inferInsert>>(
  patch: T
): Promise<ActionResult> {
  const schoolId = await getCurrentSchoolId();
  const session = await getSessionUser();
  const actor = session?.uid ?? "system";

  const before = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  if (!before) return { success: false, error: "School row not found." };

  // Compute the field-level diff so the audit log records *what changed*,
  // not the entire row each time. Skips fields not in `patch`.
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    const oldVal = (before as unknown as Record<string, unknown>)[key as string];
    const newVal = patch[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      beforeDiff[key as string] = oldVal;
      afterDiff[key as string] = newVal;
    }
  }
  if (Object.keys(afterDiff).length === 0) {
    return { success: true }; // no-op write
  }

  await db.update(schools).set(patch).where(eq(schools.id, schoolId));
  await writeAuditLog(db, {
    userId: actor,
    action: "SCHOOL_SETTINGS_UPDATE",
    targetTable: "schools",
    targetId: schoolId,
    before: beforeDiff,
    after: afterDiff,
  });

  updateTag(SCHOOL_SETTINGS_TAG);  // bust the unstable_cache; read-your-own-writes
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout"); // dashboard chrome reads school name + logo

  return { success: true };
}
