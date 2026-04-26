import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function AdminReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Reports"
      description="Generate academic performance reports, attendance summaries, and school-wide analytics across all divisions and terms."
    />
  );
}
