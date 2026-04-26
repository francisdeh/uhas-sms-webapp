import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function HodReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Reports"
      description="View subject-level performance reports and attendance data for your department. Track trends across terms and identify areas for improvement."
    />
  );
}
