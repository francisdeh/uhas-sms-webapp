import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function TeacherReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Reports"
      description="View attendance and academic performance summaries for your classes. Generate end-of-term reports for each student."
    />
  );
}
