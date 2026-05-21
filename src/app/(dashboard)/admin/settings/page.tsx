import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getSchoolSettings } from "@/features/settings/queries/get-school-settings";
import { SettingsPage } from "@/features/settings/components/SettingsPage";

export default async function AdminSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "Admin") redirect("/admin");
  const settings = await getSchoolSettings();
  return <SettingsPage settings={settings} />;
}
