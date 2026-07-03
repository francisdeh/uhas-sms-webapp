import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ProfilePage } from "@/features/profile/components/ProfilePage";

export default async function ProfilePageRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Parents don't have photos in the current data model (only Staff do).
  return <ProfilePage user={user} currentPhotoUrl={null} />;
}
