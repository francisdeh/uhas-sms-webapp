import { cookies } from "next/headers";
import { mockStaff } from "@/lib/mock/staff";
import type { SessionUser, UserRole } from "@/features/auth/types";

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("session_uid")?.value;
  const role = cookieStore.get("session_role")?.value as UserRole | undefined;
  const displayName = cookieStore.get("session_display_name")?.value;
  const email = cookieStore.get("session_email")?.value;
  const linkedId = cookieStore.get("session_linked_id")?.value;

  if (!uid || !role) return null;

  let isUnitHead = false;
  let unitHeadOf: SessionUser["unitHeadOf"] = null;

  if (role === "Teacher" && linkedId && process.env.USE_MOCK_DATA === "true") {
    const staff = mockStaff.find((s) => s.id === linkedId);
    if (staff?.isUnitHead) {
      isUnitHead = true;
      unitHeadOf = staff.unitHeadOf;
    }
  }

  return {
    uid,
    role,
    displayName: displayName ?? "",
    email: email ?? "",
    linkedId: linkedId ?? "",
    mustChangePassword: false,
    isUnitHead,
    unitHeadOf,
  };
}
