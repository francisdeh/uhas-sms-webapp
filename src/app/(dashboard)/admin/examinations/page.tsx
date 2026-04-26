import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function AdminExaminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Examinations"
      description="Grade and manage student assessments. Term scores, class scores, and end-of-term reports will be available here."
    />
  );
}
