import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi } from "@/lib/api/server";
import { DivisionReports } from "@/features/reports/components/DivisionReports";
import { Card, CardContent } from "@/components/ui/card";
import type { DivisionStats } from "@/features/reports/types";

// Rendered per-request — depends on the caller's session; opts out of
// Next's static analysis (which would fail on the Supabase env-var
// check during `next build`).
export const dynamic = "force-dynamic";

export default async function DeputyHeadReportsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Reports</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No division assigned to your account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const api = await getApi();
  const stats = (await api.reports.getDivisionStats(division)) as DivisionStats;
  return <DivisionReports stats={stats} />;
}
