import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { AssignmentForm } from "@/features/assignments/components/AssignmentForm";

export default async function NewAssignmentPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const subjectAssignments = await listTeacherAssignmentsAction(user.linkedId);
  const flat = subjectAssignments.flatMap((c) =>
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
        href="/teacher/assignments"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to assignments
      </Link>
      <AssignmentForm
        teacherId={user.linkedId}
        existing={null}
        assignments={flat}
        backHref="/teacher/assignments"
      />
    </div>
  );
}
