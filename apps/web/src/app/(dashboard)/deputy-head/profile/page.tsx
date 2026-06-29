import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getMyPhotoUrl } from "@/features/profile/queries/get-my-photo";
import { ProfilePage } from "@/features/profile/components/ProfilePage";

export default async function ProfilePageRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const photoUrl = await getMyPhotoUrl(user.linkedId);
  return <ProfilePage user={user} currentPhotoUrl={photoUrl} />;
}
