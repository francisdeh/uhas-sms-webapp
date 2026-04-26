"use server";

import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { mockUsers } from "@/lib/mock/users";
import { ROLE_DASHBOARD, type UserRole } from "@/features/auth/types";

type LoginResult =
  | { success: true; redirect: string }
  | { success: false; error: string };

export async function loginAction(idToken: string): Promise<LoginResult> {
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Look up role — mock data for now, replaced with DB in Phase 1 cutover
    const mockUser = mockUsers.find((u) => u.uid === uid);
    if (!mockUser) {
      return { success: false, error: "Account not found. Contact your administrator." };
    }

    const cookieStore = await cookies();
    cookieStore.set("session_uid", uid, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });
    cookieStore.set("session_role", mockUser.role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    cookieStore.set("session_display_name", mockUser.displayName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    cookieStore.set("session_email", mockUser.email ?? "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    cookieStore.set("session_linked_id", mockUser.linkedId ?? "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    const mustChangePassword = false; // mock: no forced change; DB will check users.mustChangePassword
    if (mustChangePassword) {
      return { success: true, redirect: "/change-password" };
    }

    return { success: true, redirect: ROLE_DASHBOARD[mockUser.role as UserRole] };
  } catch {
    return { success: false, error: "Invalid session. Please try again." };
  }
}
