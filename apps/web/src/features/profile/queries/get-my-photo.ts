import { getApi } from "@/lib/api/server";

// Returns the photo URL for the currently-logged-in user, if their account
// has one (only staff/teachers/admins have photos right now — parents don't).
export async function getMyPhotoUrl(linkedId: string | undefined): Promise<string | null> {
  if (!linkedId) return null;
  // Parents don't currently have photoUrl, so we only look at staff records.
  if (!linkedId.startsWith("STAFF-")) return null;
  const api = await getApi();
  try {
    const staff = await api.staff.get(linkedId);
    return staff.photoUrl ?? null;
  } catch {
    return null;
  }
}
