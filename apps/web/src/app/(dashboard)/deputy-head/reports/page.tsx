import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getDivisionStats } from "@/features/reports/queries/get-stats";
import { DivisionReports } from "@/features/reports/components/DivisionReports";
import { Card, CardContent } from "@/components/ui/card";

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

  const stats = await getDivisionStats(division);
  return <DivisionReports stats={stats} />;
}
