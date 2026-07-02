import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getSchemeAction } from "@/features/schemes/actions";
import { listTeacherAssignmentsAction } from "@/features/exams/actions";
import { SchemeForm } from "@/features/schemes/components/SchemeForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSchemePage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const scheme = await getSchemeAction(id);
  if (!scheme || scheme.teacherId !== user.linkedId) notFound();

  const [assignments, currentAcademicYear] = await Promise.all([
    listTeacherAssignmentsAction(user.linkedId),
    getCurrentAcademicYear(),
  ]);
  const flat = assignments.flatMap((c) =>
    c.subjects.map((s) => ({
      classId: c.classId,
      className: c.className,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
    }))
  );

  if (!flat.some((a) => a.classId === scheme.classId && a.subjectId === scheme.subjectId)) {
    flat.push({
      classId: scheme.classId,
      className: scheme.className,
      subjectId: scheme.subjectId,
      subjectName: scheme.subjectName,
    });
  }

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
        existing={scheme}
        assignments={flat}
        backHref="/teacher/schemes"
        currentAcademicYear={currentAcademicYear}
      />
    </div>
  );
}
