"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { adminAuth } from "@/lib/firebase-admin";
import { db } from "@/db";
import { users, schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { ROLE_DASHBOARD, type UserRole } from "@/features/auth/types";

type ChangePasswordResult =
  | { success: true; redirect: string }
  | { success: false; error: string };

export async function changePasswordAction(
  newPassword: string
): Promise<ChangePasswordResult> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("session_uid")?.value;
  const role = cookieStore.get("session_role")?.value as UserRole | undefined;

  if (!uid || !role) {
    return { success: false, error: "Session expired. Please log in again." };
  }

  const schoolId = await getCurrentSchoolId();
  const schoolRow = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
  const minLen = schoolRow?.passwordMinLength ?? 8;
  if (newPassword.length < minLen) {
    return { success: false, error: `Password must be at least ${minLen} characters.` };
  }

  try {
    await adminAuth.updateUser(uid, { password: newPassword });
    await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, uid));
    return { success: true, redirect: ROLE_DASHBOARD[role] };
  } catch {
    return { success: false, error: "Failed to update password. Please try again." };
  }
}
