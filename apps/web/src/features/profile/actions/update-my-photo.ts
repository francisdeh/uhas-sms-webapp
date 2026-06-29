"use server";
import type { ActionResult } from "@/lib/action-result";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";
import { getSessionUser } from "@/features/auth/queries/get-session-user";


export async function updateMyPhotoAction(photoUrl: string | null): Promise<ActionResult> {
  const session = await getSessionUser();
  const linkedId = session?.linkedId;
  if (!linkedId) return { success: false, error: "Not authenticated." };
  if (!linkedId.startsWith("STAFF-")) {
    return { success: false, error: "Photo upload is only available for staff accounts." };
  }
  await db.update(staff).set({ photoUrl }).where(eq(staff.id, linkedId));
  revalidatePath("/admin/profile");
  revalidatePath("/deputy-head/profile");
  revalidatePath("/teacher/profile");
  return { success: true };
}
