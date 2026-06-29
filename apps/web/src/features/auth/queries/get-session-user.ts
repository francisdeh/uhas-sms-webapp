import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, staff } from "@/db/schema";
import type { SessionUser, UserRole, Division } from "@/features/auth/types";

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("session_uid")?.value;
  const role = cookieStore.get("session_role")?.value as UserRole | undefined;
  const displayName = cookieStore.get("session_display_name")?.value;
  const email = cookieStore.get("session_email")?.value;
  const linkedId = cookieStore.get("session_linked_id")?.value;

  if (!uid || !role) return null;

  // Look up mustChangePassword from DB on every request. Cheap (PK lookup).
  // Teacher: join staff for isUnitHead / unitHeadOf.
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, uid),
  });
  if (!userRow) return null;

  let isUnitHead = false;
  let unitHeadOf: Division | null = null;
  if (role === "Teacher" && userRow.linkedId) {
    const staffRow = await db.query.staff.findFirst({
      where: eq(staff.id, userRow.linkedId),
    });
    if (staffRow?.isUnitHead) {
      isUnitHead = true;
      unitHeadOf = (staffRow.unitHeadOf as Division | null) ?? null;
    }
  }

  return {
    uid,
    role,
    displayName: displayName ?? "",
    email: email ?? userRow.email,
    linkedId: linkedId ?? userRow.linkedId ?? "",
    mustChangePassword: userRow.mustChangePassword ?? false,
    isUnitHead,
    unitHeadOf,
  };
}
