import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ProfilePage } from "@/features/profile/components/ProfilePage";

export default async function AdminProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let photoUrl: string | null = null;
  if (user.linkedId) {
    try {
      const api = await getApi();
      const staffRow = await api.staff.get(user.linkedId);
      photoUrl = staffRow.photoUrl ?? null;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 404) throw err;
    }
  }
  return <ProfilePage user={user} currentPhotoUrl={photoUrl} />;
}
