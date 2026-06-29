import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getSchoolStats } from "@/features/reports/queries/get-stats";
import { AdminReports } from "@/features/reports/components/AdminReports";

export default async function AdminReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const stats = await getSchoolStats();
  return <AdminReports stats={stats} />;
}
