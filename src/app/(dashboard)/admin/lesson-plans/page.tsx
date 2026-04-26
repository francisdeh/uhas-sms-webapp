import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function AdminLessonPlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Lesson Plans"
      description="Review and track lesson plans submitted across all divisions. Approve, flag, or escalate plans through the school hierarchy."
    />
  );
}
