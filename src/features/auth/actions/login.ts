"use server";

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { mockUsers } from "@/lib/mock/users";
import { ROLE_DASHBOARD, type UserRole, USER_ROLES } from "@/features/auth/types";

type LoginResult =
  | { success: true; redirect: string }
  | { success: false; error: string };

export async function loginAction(idToken: string): Promise<LoginResult> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    let role: UserRole;
    let linkedId: string;
    let displayName: string;
    let email: string;

    if (process.env.USE_MOCK_DATA === "true") {
      // Local dev: look up user from mock fixture (emulator has no custom claims)
      const mockUser = mockUsers.find((u) => u.email === decoded.email);
      if (!mockUser) {
        return { success: false, error: "Account not found. Contact your administrator." };
      }
      role = mockUser.role as UserRole;
      linkedId = mockUser.linkedId ?? "";
      displayName = mockUser.displayName;
      email = mockUser.email;
    } else {
      // Production: role and linkedId come from custom claims set by seed-firebase-users.ts
      const claimRole = decoded.role as string | undefined;
      const claimLinkedId = decoded.linkedId as string | undefined;

      if (!claimRole || !USER_ROLES.includes(claimRole as UserRole)) {
        return { success: false, error: "Account not configured. Contact your administrator." };
      }

      role = claimRole as UserRole;
      linkedId = claimLinkedId ?? "";
      displayName = decoded.name ?? "";
      email = decoded.email ?? "";
    }

    const cookieStore = await cookies();
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    };

    cookieStore.set("session_uid", uid, cookieOpts);
    cookieStore.set("session_role", role, cookieOpts);
    cookieStore.set("session_display_name", displayName, cookieOpts);
    cookieStore.set("session_email", email, cookieOpts);
    cookieStore.set("session_linked_id", linkedId, cookieOpts);

    const mustChangePassword = false;
    if (mustChangePassword) {
      return { success: true, redirect: "/change-password" };
    }

    return { success: true, redirect: ROLE_DASHBOARD[role] };
  } catch {
    return { success: false, error: "Invalid session. Please try again." };
  }
}
