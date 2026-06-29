"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("session_uid");
  cookieStore.delete("session_role");
  cookieStore.delete("session_display_name");
  cookieStore.delete("session_email");
  cookieStore.delete("session_linked_id");
  cookieStore.delete("session_expires_at");
  redirect("/login");
}
