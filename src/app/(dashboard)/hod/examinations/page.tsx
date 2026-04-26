import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function HodExaminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Examinations"
      description="Oversee examinations across your department. Review submitted scores, flag anomalies, and track student performance by subject."
    />
  );
}
