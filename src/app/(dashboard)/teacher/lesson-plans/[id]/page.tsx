import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getLessonPlanAction } from "@/features/lesson-plans/actions";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { LessonPlanForm } from "@/features/lesson-plans/components/LessonPlanForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLessonPlanPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const plan = await getLessonPlanAction(id);
  if (!plan) notFound();
  if (plan.teacherId !== user.linkedId) notFound();

  const assignments = await listTeacherAssignmentsAction(user.linkedId);
  const flat = assignments.flatMap((c) =>
    c.subjects.map((s) => ({
      classId: c.classId,
      className: c.className,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
    }))
  );

  // Always include the existing class/subject even if no longer assigned
  if (!flat.some((a) => a.classId === plan.classId && a.subjectId === plan.subjectId)) {
    flat.push({
      classId: plan.classId,
      className: plan.className,
      subjectId: plan.subjectId,
      subjectName: plan.subjectName,
    });
  }

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
        existing={plan}
        assignments={flat}
        backHref="/teacher/lesson-plans"
      />
    </div>
  );
}
