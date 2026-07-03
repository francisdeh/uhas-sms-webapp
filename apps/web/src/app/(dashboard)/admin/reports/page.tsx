import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AdminReports } from "@/features/reports/components/AdminReports";
import type { SchoolStats } from "@/features/reports/types";

export default async function AdminReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const stats = (await api.reports.getSchoolStats()) as SchoolStats;
  return <AdminReports stats={stats} />;
}
