import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getNavBadges } from "@/features/shell/queries/get-nav-badges";
import { getMyPhotoUrl } from "@/features/profile/queries/get-my-photo";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import { DashboardLayout } from "@/features/shell/components/DashboardLayout";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const [currentYear, navBadges, userPhotoUrl, settings] = await Promise.all([
    getCurrentAcademicYear(),
    getNavBadges(user),
    getMyPhotoUrl(user.linkedId),
    getSchoolSettings(),
  ]);

  return (
    <DashboardLayout
      user={user}
      currentYear={currentYear}
      navBadges={navBadges}
      userPhotoUrl={userPhotoUrl}
      schoolName={settings.name}
      schoolLogoUrl={settings.logoUrl}
    >
      {children}
    </DashboardLayout>
  );
}
