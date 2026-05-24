"use server";

import { cookies } from "next/headers";
import type { ActionResult } from "@/lib/action-result";

const SESSION_KEYS = [
  "session_uid",
  "session_role",
  "session_display_name",
  "session_email",
  "session_linked_id",
] as const;

// Re-issue every session cookie with a fresh 8h maxAge. Called from the
// expiry-warning modal's "Extend" button.
export async function extendSessionAction(): Promise<ActionResult<{ newExpiryMs: number }>> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("session_uid")?.value;
  if (!uid) return { success: false, error: "Not signed in." };

  const MAX_AGE_SEC = 60 * 60 * 8;
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE_SEC,
  };

  for (const key of SESSION_KEYS) {
    const value = cookieStore.get(key)?.value ?? "";
    cookieStore.set(key, value, cookieOpts);
  }
  const newExpiryMs = Date.now() + MAX_AGE_SEC * 1000;
  cookieStore.set("session_expires_at", String(newExpiryMs), {
    ...cookieOpts,
    httpOnly: false,
  });
  return { success: true, newExpiryMs };
}
