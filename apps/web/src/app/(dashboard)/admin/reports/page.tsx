import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AdminReports } from "@/features/reports/components/AdminReports";
import type { SchoolStats } from "@/features/reports/types";

// Rendered per-request — the response depends on the caller's session.
// Without this, `next build` tries to statically evaluate the page and
// dies on the Supabase server client's env-var check.
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const stats = (await api.reports.getSchoolStats()) as SchoolStats;
  return <AdminReports stats={stats} />;
}
