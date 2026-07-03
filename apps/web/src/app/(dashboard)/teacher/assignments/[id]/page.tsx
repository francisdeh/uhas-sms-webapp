import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { AssignmentForm } from "@/features/assignments/components/AssignmentForm";
import type { Assignment } from "@/features/assignments/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditAssignmentPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  let assignment;
  try {
    assignment = (await api.assignments.get(id)) as unknown as Assignment;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  if (assignment.teacherId !== user.linkedId) notFound();

  const rows = (await api.classSubjects.listByTeacher(user.linkedId)).rows;
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

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
