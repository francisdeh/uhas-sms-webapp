import { eq } from "drizzle-orm";

import { db } from "@/db";
import { guardians, staff, users } from "@/db/schema";
import type { Division, SessionUser, UserRole } from "@/features/auth/types";
import { USER_ROLES } from "@/features/auth/types";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve the current Server Component's user via Supabase Auth.
 *
 * Identity comes from the Supabase session (cookie-backed, refreshed
 * by the proxy on every navigation). Role + linked_id come from the
 * JWT's `app_metadata` — those are server-set and trustworthy.
 *
 * displayName gets composed from the linked staff/guardian record
 * so the name on screen reflects what's in the school registry, not
 * whatever Supabase has cached in user_metadata.
 *
 * `mustChangePassword` reads from `user_metadata.must_change_password`
 * — a per-user toggle set by the admin user-creation flow + cleared
 * after the first successful change-password.
 *
 * Returns null on any of:
 *   - no session
 *   - session but no role claim (account not fully set up)
 *   - session but the linked `users` row doesn't exist
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = user.app_metadata?.role as UserRole | undefined;
  if (!role || !USER_ROLES.includes(role)) return null;

  // The bridge row in our `users` table holds linked_id + isActive flag.
  // We still rely on it for cross-references (staff.id, guardian.id).
  // Looked up by the Supabase auth user id (uuid as varchar).
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
  });
  if (!userRow) return null;

  // Compose displayName from the linked DB record so the name on
  // screen reflects what the school has on file — staff for non-Parent
  // roles, guardians for Parent. Falls back to email/phone if the
  // linked row is missing for some reason.
  let displayName = "";
  let isUnitHead = false;
  let unitHeadOf: Division | null = null;

  if (userRow.linkedId) {
    if (role === "Parent") {
      const guardianRow = await db.query.guardians.findFirst({
        where: eq(guardians.id, userRow.linkedId),
      });
      if (guardianRow) {
        displayName = `${guardianRow.firstName} ${guardianRow.lastName}`;
      }
    } else {
      const staffRow = await db.query.staff.findFirst({
        where: eq(staff.id, userRow.linkedId),
      });
      if (staffRow) {
        displayName = `${staffRow.firstName} ${staffRow.lastName}`;
        if (role === "Teacher" && staffRow.isUnitHead) {
          isUnitHead = true;
          unitHeadOf = (staffRow.unitHeadOf as Division | null) ?? null;
        }
      }
    }
  }

  if (!displayName) {
    displayName = user.email ?? user.phone ?? "";
  }

  const mustChangePassword = Boolean(user.user_metadata?.must_change_password);

  return {
    uid: user.id,
    role,
    displayName,
    email: user.email ?? userRow.email ?? "",
    linkedId: userRow.linkedId ?? "",
    mustChangePassword,
    isUnitHead,
    unitHeadOf,
  };
}
