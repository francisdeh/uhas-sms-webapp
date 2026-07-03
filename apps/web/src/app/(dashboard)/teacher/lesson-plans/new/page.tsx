import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { LessonPlanForm } from "@/features/lesson-plans/components/LessonPlanForm";

export default async function NewLessonPlanPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const { rows } = await api.classSubjects.listByTeacher(user.linkedId);
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/lesson-plans"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to lesson plans
      </Link>
      <LessonPlanForm
        teacherId={user.linkedId}
        existing={null}
        assignments={flat}
        backHref="/teacher/lesson-plans"
      />
    </div>
  );
}
