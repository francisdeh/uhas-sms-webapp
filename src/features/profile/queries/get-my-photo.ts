import { eq } from "drizzle-orm";
import { db } from "@/db";
import { staff } from "@/db/schema";

// Returns the photo URL for the currently-logged-in user, if their account
// has one (only staff/teachers/admins have photos right now — parents don't).
export async function getMyPhotoUrl(linkedId: string | undefined): Promise<string | null> {
  if (!linkedId) return null;
  // staff IDs look like STAFF-NNN; student IDs like UHAS-NNNN-NNNN. Parents
  // don't currently have photoUrl, so we only look at staff.
  if (!linkedId.startsWith("STAFF-")) return null;
  const row = await db.query.staff.findFirst({ where: eq(staff.id, linkedId) });
  return row?.photoUrl ?? null;
}
