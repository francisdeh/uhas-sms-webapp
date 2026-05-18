import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listLessonPlansForTeacherAction } from "@/features/lesson-plans/actions";
import { LessonPlansList } from "@/features/lesson-plans/components/LessonPlansList";

export default async function TeacherLessonPlansPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const plans = await listLessonPlansForTeacherAction(user.linkedId);

  return <LessonPlansList plans={plans} baseHref="/teacher/lesson-plans" />;
}
