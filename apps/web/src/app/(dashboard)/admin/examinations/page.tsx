import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { ExamsManager } from "@/features/exams/components/ExamsManager";
import type { Exam } from "@/features/exams/types";

export default async function AdminExaminationsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const currentYear = await getCurrentAcademicYear();
  const resp = await api.exams.list({ academicYear: currentYear, size: 100 });
  const exams: Exam[] = resp.items.map((e) => ({
    id: e.id,
    schoolId: e.schoolId,
    name: e.name,
    type: e.type,
    term: e.term,
    academicYear: e.academicYear,
    isPublished: e.isPublished,
    publishedAt: e.publishedAt ?? null,
    createdAt: e.createdAt ?? new Date().toISOString(),
  }));

  return <ExamsManager initialExams={exams} currentYear={currentYear} />;
}
