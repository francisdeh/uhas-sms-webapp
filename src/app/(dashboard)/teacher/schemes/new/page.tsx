import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { SchemeForm } from "@/features/schemes/components/SchemeForm";

export default async function NewSchemePage() {
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
        href="/teacher/schemes"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to schemes
      </Link>
      <SchemeForm
        teacherId={user.linkedId}
        existing={null}
        assignments={flat}
        backHref="/teacher/schemes"
      />
    </div>
  );
}
