import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { ProfilePage } from "@/features/profile/components/ProfilePage";

export default async function ProfilePageRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  let photoUrl: string | null = null;
  if (user.linkedId) {
    const api = await getApi();
    try {
      const staff = await api.staff.get(user.linkedId);
      photoUrl = staff.photoUrl ?? null;
    } catch (err) {
      // 404 → linkedId is not a staff row (e.g. parent). Photos are staff-only for now.
      if (!(err instanceof ApiError && err.status === 404)) throw err;
    }
  }
  return <ProfilePage user={user} currentPhotoUrl={photoUrl} />;
}
