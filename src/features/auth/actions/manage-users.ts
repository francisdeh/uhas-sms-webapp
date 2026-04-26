"use server";

import { adminAuth } from "@/lib/firebase-admin";
import { mockUsers } from "@/lib/mock/users";
import type { UserRole } from "@/features/auth/types";

export type ManagedUser = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
  isActive: boolean;
};

export async function listUsersAction(): Promise<ManagedUser[]> {
  // Mock data — replaced with DB query in Phase 1 cutover
  return mockUsers.map((u) => ({
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    role: u.role as UserRole,
    linkedId: u.linkedId,
    isActive: true,
  }));
}

export type CreateUserInput = {
  email: string;
  displayName: string;
  role: UserRole;
  linkedId: string;
};

type ActionResult = { success: true } | { success: false; error: string };

export async function createUserAction(
  input: CreateUserInput
): Promise<ActionResult & { uid?: string; inviteLink?: string }> {
  try {
    const tempPassword = Math.random().toString(36).slice(-10) + "A1!";
    const created = await adminAuth.createUser({
      email: input.email,
      displayName: input.displayName,
      password: tempPassword,
    });

    // TODO (Phase 1 cutover): insert into users table with mustChangePassword=true

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
    // TODO (Phase 1 cutover): set users.isActive = false in DB
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

export async function reactivateUserAction(uid: string): Promise<ActionResult> {
  try {
    await adminAuth.updateUser(uid, { disabled: false });
    // TODO (Phase 1 cutover): set users.isActive = true in DB
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
    // TODO (Phase 1 cutover): persist role + linkedId changes to DB
    return { success: true };
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "Unknown error";
    return { success: false, error: msg };
  }
}
