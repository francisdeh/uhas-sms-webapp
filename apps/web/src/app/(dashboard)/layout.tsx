import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { nextAcademicYear } from "@/features/promotions/lib/academic-year";
import { getNavBadges } from "@/features/shell/queries/get-nav-badges";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import { DashboardLayout } from "@/features/shell/components/DashboardLayout";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const [currentYear, navBadges, settings] = await Promise.all([
    getCurrentAcademicYear(),
    getNavBadges(user),
    getSchoolSettings(),
  ]);

  // Reuses settings.terms (already fetched above) instead of a second
  // round-trip through getAcademicYearOptions() — see that function's
  // docstring for why this is independent of the switcher cookie.
  const yearOptions = Array.from(
    new Set([
      settings.academicYear,
      nextAcademicYear(settings.academicYear),
      ...settings.terms.map((t) => t.academicYear),
    ])
  ).sort();

  return (
    <DashboardLayout
      user={user}
      currentYear={currentYear}
      yearOptions={yearOptions}
      navBadges={navBadges}
      schoolName={settings.name}
      schoolLogoUrl={settings.logoUrl}
    >
      {children}
    </DashboardLayout>
  );
}
