import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getPscReportData } from "@/features/reports/queries/get-psc-report";
import { PscReportPage } from "@/features/reports/components/PscReportPage";

export default async function AdminPscReportRoute() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getPscReportData();
  return <PscReportPage data={data} backHref="/admin/reports" />;
}
