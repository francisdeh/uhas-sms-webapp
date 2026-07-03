import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { AssignmentForm } from "@/features/assignments/components/AssignmentForm";

export default async function NewAssignmentPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const rows = (await api.classSubjects.listByTeacher(user.linkedId)).rows;
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

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
