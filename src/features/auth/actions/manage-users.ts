"use server";
import type { ActionResult } from "@/lib/action-result";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { adminAuth } from "@/lib/firebase-admin";
import { db } from "@/db";
import { users, staff, guardians, schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { writeAuditLog } from "@/lib/audit-log";
import type { UserRole } from "@/features/auth/types";

export type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  isActive: boolean;
  photoUrl: string | null;
};

export async function listUsersAction(): Promise<ManagedUser[]> {
  const schoolId = await getCurrentSchoolId();
  // Join both staff (Admin / DH / Teacher) and guardians (Parent). Each
  // row will have at most one side populated; we coalesce in app code.
  const rows = await db
    .select({
      uid: users.id,
      email: users.email,
      role: users.role,
      linkedId: users.linkedId,
      isActive: users.isActive,
      staffFirstName: staff.firstName,
      staffLastName: staff.lastName,
      staffPhotoUrl: staff.photoUrl,
      guardianFirstName: guardians.firstName,
      guardianLastName: guardians.lastName,
    })
    .from(users)
    .leftJoin(staff, eq(staff.id, users.linkedId))
    .leftJoin(guardians, eq(guardians.id, users.linkedId))
    .where(eq(users.schoolId, schoolId));

  return rows.map((r) => {
    const firstName = r.staffFirstName ?? r.guardianFirstName ?? "";
    const lastName = r.staffLastName ?? r.guardianLastName ?? "";
    return {
      uid: r.uid,
      email: r.email,
      displayName: firstName ? `${firstName} ${lastName}`.trim() : "",
      role: r.role as UserRole,
      linkedId: r.linkedId ?? "",
      isActive: r.isActive ?? true,
      photoUrl: r.staffPhotoUrl ?? null,
    };
  });
}

export type CreateUserInput = {
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
};


export async function createUserAction(
  input: CreateUserInput
): Promise<ActionResult<{ uid: string; inviteLink: string }>> {
  try {
    const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
    const created = await adminAuth.createUser({
      email: input.email,
      displayName: input.displayName,
      password: tempPassword,
    });

    const schoolId = await getCurrentSchoolId();
    const schoolRow = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
    const forceChange = schoolRow?.forcePasswordChangeOnFirstLogin ?? true;

    await db.insert(users).values({
      id: created.uid,
      schoolId,
      email: input.email,
      role: input.role,
      linkedId: input.linkedId,
      isActive: true,
      mustChangePassword: forceChange,
    });

    const inviteLink = await adminAuth.generatePasswordResetLink(input.email);
    return { success: true, uid: created.uid, inviteLink };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function deactivateUserAction(uid: string): Promise<ActionResult> {
  try {
    await adminAuth.updateUser(uid, { disabled: true });
    await db.update(users).set({ isActive: false }).where(eq(users.id, uid));
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function reactivateUserAction(uid: string): Promise<ActionResult> {
  try {
    await adminAuth.updateUser(uid, { disabled: false });
    await db.update(users).set({ isActive: true }).where(eq(users.id, uid));
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function updateUserAction(
  uid: string,
  input: Pick<CreateUserInput, "displayName" | "role" | "linkedId">
): Promise<ActionResult> {
  try {
    await adminAuth.updateUser(uid, { displayName: input.displayName });

    const cookieStore = await cookies();
    const actor = cookieStore.get("session_uid")?.value ?? "system";

    // Detect role change for audit log
    const before = await db.query.users.findFirst({ where: eq(users.id, uid) });

    await db
      .update(users)
      .set({ role: input.role, linkedId: input.linkedId })
      .where(eq(users.id, uid));

    if (before && before.role !== input.role) {
      await writeAuditLog(db, {
        userId: actor,
        action: "ROLE_CHANGE",
        targetTable: "users",
        targetId: uid,
        before: { role: before.role },
        after: { role: input.role },
      });
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}
