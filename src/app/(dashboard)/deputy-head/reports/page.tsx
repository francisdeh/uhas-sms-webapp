import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function DeputyHeadReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Reports"
      description="View academic performance and attendance reports for your division. Generate term summaries and identify students who need support."
    />
  );
}
