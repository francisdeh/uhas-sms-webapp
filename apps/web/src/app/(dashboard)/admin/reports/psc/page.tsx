import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { PscReportPage } from "@/features/reports/components/PscReportPage";
import type { PscReportData } from "@/features/reports/queries/get-psc-report";

export default async function AdminPscReportRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const data = (await api.reports.getPscReport()) as PscReportData;
  return <PscReportPage data={data} backHref="/admin/reports" />;
}
