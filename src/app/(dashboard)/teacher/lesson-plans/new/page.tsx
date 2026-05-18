import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { LessonPlanForm } from "@/features/lesson-plans/components/LessonPlanForm";

export default async function NewLessonPlanPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const assignments = await listTeacherAssignmentsAction(user.linkedId);
  const flat = assignments.flatMap((c) =>
    c.subjects.map((s) => ({
      classId: c.classId,
      className: c.className,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
    }))
  );

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
