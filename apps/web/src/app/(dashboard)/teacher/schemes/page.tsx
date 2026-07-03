import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { SchemesList } from "@/features/schemes/components/SchemesList";
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

export default async function TeacherSchemesPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  const resp = await api.schemes.list({ teacherId: user.linkedId, size: 200 });
  const schemes = resp.items.map(toScheme);

  return <SchemesList schemes={schemes} baseHref="/teacher/schemes" />;
}
