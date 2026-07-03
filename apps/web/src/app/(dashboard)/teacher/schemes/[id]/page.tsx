import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getApi, ApiError } from "@/lib/api/server";
import { SchemeForm } from "@/features/schemes/components/SchemeForm";
import type { Scheme } from "@/features/schemes/types";
import type { components } from "@/types/api";

function toScheme(s: components["schemas"]["SchemeRead"]): Scheme {
  return {
    id: s.id,
    schoolId: s.schoolId,
    teacherId: s.teacherId,
    teacherName: `${s.teacherFirstName} ${s.teacherLastName}`.trim(),
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    classId: s.classId,
    className: s.className,
    division: s.division,
    type: s.type,
    term: s.term,
    academicYear: s.academicYear,
    title: s.title,
    fileUrl: s.fileUrl ?? null,
    content: s.content ?? null,
    status: s.status,
    reviewerComment: s.reviewerComment ?? null,
    reviewedById: s.reviewedById ?? null,
    reviewedByName: s.reviewedByName ?? null,
    reviewedAt: s.reviewedAt ?? null,
    submittedAt: s.submittedAt ?? null,
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.updatedAt ?? new Date().toISOString(),
  };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSchemePage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  let schemeRead;
  try {
    schemeRead = await api.schemes.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  if (schemeRead.teacherId !== user.linkedId) notFound();
  const scheme = toScheme(schemeRead);

  const [{ rows }, currentAcademicYear] = await Promise.all([
    api.classSubjects.listByTeacher(user.linkedId),
    getCurrentAcademicYear(),
  ]);
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

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
