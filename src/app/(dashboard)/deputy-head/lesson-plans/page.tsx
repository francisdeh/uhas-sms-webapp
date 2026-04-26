import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function DeputyHeadLessonPlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Lesson Plans"
      description="Review and approve lesson plans submitted by teachers in your division. Plans escalated from HODs appear here for final sign-off."
    />
  );
}
