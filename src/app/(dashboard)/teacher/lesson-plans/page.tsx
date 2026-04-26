import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { ComingSoon } from "@/components/ui/coming-soon";

export default async function TeacherLessonPlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ComingSoon
      title="Lesson Plans"
      description="Submit and track your weekly lesson plans. Plans move through the HOD and Deputy Head approval chain before being marked complete."
    />
  );
}
