import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import type { Staff, StaffSystemRole } from "@/features/staff/types";
import type { Division } from "@/features/auth/types";

export async function getStaffById(id: string): Promise<Staff | undefined> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  return row ? toStaff(row) : undefined;
}

export function toStaff(row: typeof staff.$inferSelect): Staff {
  return {
    id: row.id,
    schoolId: row.schoolId,
    uhasId: row.uhasId ?? null,
    firstName: row.firstName,
    lastName: row.lastName,
    rank: row.rank ?? "",
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
