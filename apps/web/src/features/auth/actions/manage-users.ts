"use server";
import type { ActionResult } from "@/lib/action-result";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users, staff, guardians, schools } from "@/db/schema";
import { getCurrentSchoolId } from "@/lib/school";
import { writeAuditLog } from "@/lib/audit-log";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
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

// "Ban for 100 years" is Supabase's idiomatic way to disable an account
// at the Auth layer. Reactivation sets it to "none".
const PERMANENT_BAN = "876600h";

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
  input: CreateUserInput,
): Promise<ActionResult<{ uid: string; inviteLink: string }>> {
  try {
    const supabase = getSupabaseAdmin();
    const schoolId = await getCurrentSchoolId();
    const schoolRow = await db.query.schools.findFirst({ where: eq(schools.id, schoolId) });
    const forceChange = schoolRow?.forcePasswordChangeOnFirstLogin ?? true;

    // Random throwaway password — the invite email gives the user a
    // recovery link to set their own. The password just satisfies
    // Supabase's "email signups need a password" requirement.
    const tempPassword = Math.random().toString(36).slice(-10) + "A1!";

    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: true,
      app_metadata: {
        role: input.role,
        school_id: schoolId,
        linked_id: input.linkedId,
      },
      user_metadata: {
        display_name: input.displayName,
        must_change_password: forceChange,
      },
    });
    if (createError || !created.user) {
      return { success: false, error: createError?.message ?? "Failed to create user." };
    }
    const uid = created.user.id;

    await db.insert(users).values({
      id: uid,
      schoolId,
      email: input.email,
      role: input.role,
      linkedId: input.linkedId,
      isActive: true,
      mustChangePassword: forceChange,
    });

    // generateLink returns a single-use recovery URL the admin can hand
    // the new user. They click → land on /change-password → set real password.
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: input.email,
    });
    if (linkError) {
      return { success: false, error: linkError.message };
    }

    return {
      success: true,
      uid,
      inviteLink: linkData.properties?.action_link ?? "",
    };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function deactivateUserAction(uid: string): Promise<ActionResult> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.updateUserById(uid, {
      ban_duration: PERMANENT_BAN,
    });
    if (error) return { success: false, error: error.message };
    await db.update(users).set({ isActive: false }).where(eq(users.id, uid));
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function reactivateUserAction(uid: string): Promise<ActionResult> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.auth.admin.updateUserById(uid, {
      ban_duration: "none",
    });
    if (error) return { success: false, error: error.message };
    await db.update(users).set({ isActive: true }).where(eq(users.id, uid));
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function updateUserAction(
  uid: string,
  input: Pick<CreateUserInput, "displayName" | "role" | "linkedId">,
): Promise<ActionResult> {
  try {
    const supabase = getSupabaseAdmin();
    const schoolId = await getCurrentSchoolId();
    const session = await getSessionUser();
    const actor = session?.uid ?? "system";

    // Update Supabase user — both the privileged role claim (app_metadata)
    // and the user-displayed name (user_metadata). The proxy + getSessionUser
    // read role from app_metadata so the change takes effect on next request.
    const { error: updateError } = await supabase.auth.admin.updateUserById(uid, {
      app_metadata: {
        role: input.role,
        school_id: schoolId,
        linked_id: input.linkedId,
      },
      user_metadata: {
        display_name: input.displayName,
      },
    });
    if (updateError) return { success: false, error: updateError.message };

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
