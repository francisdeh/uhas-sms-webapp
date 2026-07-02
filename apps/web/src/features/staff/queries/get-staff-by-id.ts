import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import {
  TEACHER_RANKS,
  type Staff,
  type StaffSystemRole,
  type TeacherRank,
} from "@/features/staff/types";
import type { Division } from "@/features/auth/types";

export async function getStaffById(id: string): Promise<Staff | undefined> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  return row ? toStaff(row) : undefined;
}

const TEACHER_RANKS_SET = new Set<string>(TEACHER_RANKS);

/**
 * Legacy `staff.rank` rows may hold values outside the current
 * `TeacherRank` union (`"Class Teacher"`, position titles). The
 * Alembic data migration NULLs those out, but until it runs we
 * defensively coerce unknown strings back to `null` here.
 */
function normalizeRank(rank: string | null | undefined): TeacherRank | null {
  return rank && TEACHER_RANKS_SET.has(rank) ? (rank as TeacherRank) : null;
}

export function toStaff(row: typeof staff.$inferSelect): Staff {
  return {
    id: row.id,
    schoolId: row.schoolId,
    uhasId: row.uhasId ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    rank: normalizeRank(row.rank),
    systemRole: (row.systemRole as StaffSystemRole) ?? "Teacher",
    division: (row.division as Division | null) ?? null,
    isUnitHead: row.isUnitHead ?? false,
    unitHeadOf: (row.unitHeadOf as Division | null) ?? null,
    photoUrl: row.photoUrl ?? null,
    phone: row.phone ?? "",
    email: row.email ?? "",
    isActive: row.isActive ?? true,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
