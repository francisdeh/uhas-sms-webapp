import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listLessonPlansForReviewAction } from "@/features/lesson-plans/actions";
import { LessonPlansOversight } from "@/features/lesson-plans/components/LessonPlansOversight";

export default async function AdminLessonPlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const plans = await listLessonPlansForReviewAction({});

  return <LessonPlansOversight plans={plans} />;
}
