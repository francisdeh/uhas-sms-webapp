import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { PscReportPage } from "@/features/reports/components/PscReportPage";
import type { PscReportData } from "@/features/reports/types";

// Rendered per-request — depends on the caller's session; opts out of
// Next's static analysis (which would fail on the Supabase env-var
// check during `next build`).
export const dynamic = "force-dynamic";

export default async function AdminPscReportRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const data = (await api.reports.getPscReport()) as PscReportData;
  return <PscReportPage data={data} backHref="/admin/reports" />;
}
