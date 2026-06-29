"use server";
import type { ActionResult } from "@/lib/action-result";

import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { writeAuditLog } from "@/lib/audit-log";
import { toStaff } from "@/features/staff/queries/get-staff-by-id";
import type {
  Staff,
  CreateStaffInput,
  UpdateStaffInput,
  ChangeRoleInput,
  ToggleUnitHeadInput,
} from "@/features/staff/types";


const ROLE_WEIGHT: Record<Staff["systemRole"], number> = {
  Admin: 0,
  DeputyHead: 1,
  Teacher: 2,
  Accountant: 3,
};

export async function listStaffAction(): Promise<Staff[]> {
  const schoolId = await getCurrentSchoolId();
  const rows = await db.query.staff.findMany({
    where: eq(staff.schoolId, schoolId),
    orderBy: [asc(staff.lastName)],
  });
  return rows
    .map(toStaff)
    .sort((a, b) => {
      const weightDiff = ROLE_WEIGHT[a.systemRole] - ROLE_WEIGHT[b.systemRole];
      if (weightDiff !== 0) return weightDiff;
      return a.lastName.localeCompare(b.lastName);
    });
}

export async function createStaffAction(
  data: CreateStaffInput
): Promise<
  | { success: true; id: string; inviteLink: string }
  | { success: false; error: string }
> {
  const schoolId = await getCurrentSchoolId();

  const existing = await db.query.staff.findFirst({
    where: and(eq(staff.schoolId, schoolId), eq(staff.email, data.email)),
  });
  if (existing) return { success: false, error: "Email already registered." };
  if (data.systemRole !== "Admin" && !data.division) {
    return { success: false, error: "Division is required for this role." };
  }

  const prefix = "STAFF-";
  const last = await db.query.staff.findFirst({
    where: and(eq(staff.schoolId, schoolId), like(staff.id, `${prefix}%`)),
    orderBy: [desc(staff.id)],
  });
  const nextSeq = last ? Number(last.id.slice(prefix.length)) + 1 : 1;
  const id = `${prefix}${String(nextSeq).padStart(3, "0")}`;

  await db.insert(staff).values({
    id,
    schoolId,
    uhasId: data.uhasId ?? null,
    firstName: data.firstName,
    lastName: data.lastName,
    rank: data.rank,
    systemRole: data.systemRole,
    division: data.division ?? null,
    isUnitHead: data.isUnitHead ?? false,
    unitHeadOf: data.unitHeadOf ?? null,
    photoUrl: data.photoUrl ?? null,
    phone: data.phone,
    email: data.email,
    isActive: true,
  });

  revalidatePath("/admin/staff");
  return { success: true, id, inviteLink: `/invite?token=${id}` };
}

export async function updateStaffAction(
  id: string,
  data: UpdateStaffInput
): Promise<ActionResult> {
  const existing = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!existing) return { success: false, error: "Staff not found." };

  const patch: Partial<typeof staff.$inferInsert> = {};
  if (data.uhasId !== undefined) patch.uhasId = data.uhasId || null;
  if (data.firstName !== undefined) patch.firstName = data.firstName;
  if (data.lastName !== undefined) patch.lastName = data.lastName;
  if (data.rank !== undefined) patch.rank = data.rank;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (data.email !== undefined) patch.email = data.email;
  if (data.photoUrl !== undefined) patch.photoUrl = data.photoUrl;

  if (Object.keys(patch).length === 0) return { success: true };

  await db.update(staff).set(patch).where(eq(staff.id, id));
  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return { success: true };
}

export async function toggleUnitHeadAction(
  id: string,
  data: ToggleUnitHeadInput
): Promise<ActionResult> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!row) return { success: false, error: "Staff not found." };
  if (data.isUnitHead && !data.unitHeadOf) {
    return { success: false, error: "Pick which unit this staff heads." };
  }
  if (data.isUnitHead && row.systemRole !== "Teacher") {
    return { success: false, error: "Only teachers can be Unit Heads." };
  }

  await db
    .update(staff)
    .set({
      isUnitHead: data.isUnitHead,
      unitHeadOf: data.isUnitHead ? data.unitHeadOf ?? null : null,
    })
    .where(eq(staff.id, id));
  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return { success: true };
}

export async function changeRoleAction(
  id: string,
  data: ChangeRoleInput
): Promise<ActionResult> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!row) return { success: false, error: "Staff not found." };
  if (data.systemRole !== "Admin" && !data.division) {
    return { success: false, error: "Division is required for this role." };
  }

  const patch: Partial<typeof staff.$inferInsert> = {
    systemRole: data.systemRole,
    division: data.systemRole === "Admin" ? null : data.division ?? null,
  };
  if (data.systemRole !== "Teacher") {
    patch.isUnitHead = false;
    patch.unitHeadOf = null;
  }

  await db.update(staff).set(patch).where(eq(staff.id, id));

  if (row.systemRole !== data.systemRole) {
    const session = await getSessionUser();
    const actor = session?.uid ?? "system";
    await writeAuditLog(db, {
      userId: actor,
      action: "ROLE_CHANGE",
      targetTable: "staff",
      targetId: id,
      before: { systemRole: row.systemRole },
      after: { systemRole: data.systemRole },
    });
  }

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return { success: true };
}

export async function deactivateStaffAction(id: string): Promise<ActionResult> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!row) return { success: false, error: "Staff not found." };
  if (!row.isActive) return { success: false, error: "Staff member is already inactive." };
  await db.update(staff).set({ isActive: false }).where(eq(staff.id, id));
  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return { success: true };
}

export async function reactivateStaffAction(id: string): Promise<ActionResult> {
  const row = await db.query.staff.findFirst({ where: eq(staff.id, id) });
  if (!row) return { success: false, error: "Staff not found." };
  if (row.isActive) return { success: false, error: "Staff member is already active." };
  await db.update(staff).set({ isActive: true }).where(eq(staff.id, id));
  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${id}`);
  return { success: true };
}
