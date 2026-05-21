"use server";

import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { adminAuth } from "@/lib/firebase-admin";
import { db } from "@/db";
import { users, staff, guardians, schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { ROLE_DASHBOARD, type UserRole, USER_ROLES } from "@/features/auth/types";

type LoginResult =
  | { success: true; redirect: string }
  | { success: false; error: string };

export async function loginAction(idToken: string): Promise<LoginResult> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email ?? "";

    // Look the user up in our `users` table first (by UID, then by email for
    // backwards-compat with users that haven't been linked yet).
    let userRow = await db.query.users.findFirst({ where: eq(users.id, uid) });
    if (!userRow && email) {
      userRow = await db.query.users.findFirst({ where: eq(users.email, email) });
    }
    if (!userRow) {
      return { success: false, error: "Account not found. Contact your administrator." };
    }

    const role = userRow.role as UserRole;
    if (!USER_ROLES.includes(role)) {
      return { success: false, error: "Account not configured. Contact your administrator." };
    }
    if (userRow.isActive === false) {
      return { success: false, error: "Account is deactivated. Contact your administrator." };
    }

    // Compose displayName from the linked DB record so the name on screen
    // reflects what the school has on file — staff for Admin/DH/Teacher,
    // guardians for Parent. Firebase displayName is only used when nothing
    // is linked (shouldn't happen for seeded accounts).
    let displayName = decoded.name ?? "";
    if (userRow.linkedId) {
      if (role === "Parent") {
        const guardianRow = await db.query.guardians.findFirst({
          where: eq(guardians.id, userRow.linkedId),
        });
        if (guardianRow) displayName = `${guardianRow.firstName} ${guardianRow.lastName}`;
      } else {
        const staffRow = await db.query.staff.findFirst({
          where: eq(staff.id, userRow.linkedId),
        });
        if (staffRow) displayName = `${staffRow.firstName} ${staffRow.lastName}`;
      }
    }

    // Session lifetime is admin-configurable via /admin/settings → Security.
    const schoolId = await getCurrentSchoolId();
    const schoolRow = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
    const minutes = schoolRow?.sessionTimeoutMinutes ?? 480;
    const MAX_AGE_SEC = minutes * 60;

    const cookieStore = await cookies();
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: MAX_AGE_SEC,
    };

    cookieStore.set("session_uid", uid, cookieOpts);
    cookieStore.set("session_role", role, cookieOpts);
    cookieStore.set("session_display_name", displayName, cookieOpts);
    cookieStore.set("session_email", userRow.email, cookieOpts);
    cookieStore.set("session_linked_id", userRow.linkedId ?? "", cookieOpts);

    // Non-httpOnly companion: client reads this to schedule the expiry warning.
    cookieStore.set("session_expires_at", String(Date.now() + MAX_AGE_SEC * 1000), {
      ...cookieOpts,
      httpOnly: false,
    });

    if (userRow.mustChangePassword) {
      return { success: true, redirect: "/change-password" };
    }

    return { success: true, redirect: ROLE_DASHBOARD[role] };
  } catch {
    return { success: false, error: "Invalid session. Please try again." };
  }
}
