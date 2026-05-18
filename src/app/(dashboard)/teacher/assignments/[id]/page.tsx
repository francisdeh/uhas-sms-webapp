import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getAssignmentAction } from "@/features/assignments/actions";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { AssignmentForm } from "@/features/assignments/components/AssignmentForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAssignmentPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const assignment = await getAssignmentAction(id);
  if (!assignment || assignment.teacherId !== user.linkedId) notFound();

  const subjectAssignments = await listTeacherAssignmentsAction(user.linkedId);
  const flat = subjectAssignments.flatMap((c) =>
    c.subjects.map((s) => ({
      classId: c.classId,
      className: c.className,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
    }))
  );

  if (!flat.some((a) => a.classId === assignment.classId && a.subjectId === assignment.subjectId)) {
    flat.push({
      classId: assignment.classId,
      className: assignment.className,
      subjectId: assignment.subjectId,
      subjectName: assignment.subjectName,
    });
  }

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/assignments"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to assignments
      </Link>
      <AssignmentForm
        teacherId={user.linkedId}
        existing={assignment}
        assignments={flat}
        backHref="/teacher/assignments"
      />
    </div>
  );
}
