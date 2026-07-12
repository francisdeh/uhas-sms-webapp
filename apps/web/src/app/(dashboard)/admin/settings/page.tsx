import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import { getGradingDefaults } from "@/features/settings/queries/get-grading-defaults";
import { SettingsPage } from "@/features/settings/components/SettingsPage";
import { ADMIN } from "@/features/auth/types";

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== ADMIN) redirect("/admin");
  const [settings, gradingDefaults] = await Promise.all([
    getSchoolSettings(),
    getGradingDefaults(),
  ]);
  return <SettingsPage settings={settings} gradingDefaults={gradingDefaults} />;
}
