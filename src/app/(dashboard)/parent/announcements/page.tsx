import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function ParentAnnouncementsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Announcements"
      description="Stay up to date with school-wide announcements, event notices, and important messages from the administration."
    />
  );
}
