"use server";

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
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

  try {
    await adminAuth.updateUser(uid, { password: newPassword });

    // TODO (Phase 1 DB cutover): set users.mustChangePassword = false in DB

    return { success: true, redirect: ROLE_DASHBOARD[role] };
  } catch {
    return { success: false, error: "Failed to update password. Please try again." };
  }
}
