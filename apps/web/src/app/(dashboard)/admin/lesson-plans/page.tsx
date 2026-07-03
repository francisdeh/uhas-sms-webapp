import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { LessonPlansOversight } from "@/features/lesson-plans/components/LessonPlansOversight";
import type { LessonPlan } from "@/features/lesson-plans/types";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";

export default async function AdminLessonPlansPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const api = await getApi();
  const [resp, currentYear] = await Promise.all([
    api.lessonPlans.list({ size: 200 }),
    getCurrentAcademicYear(),
  ]);
  const plans: LessonPlan[] = resp.items.map((p) => ({
    id: p.id,
    schoolId: p.schoolId,
    teacherId: p.teacherId,
    teacherName: `${p.teacherFirstName} ${p.teacherLastName}`.trim(),
    subjectId: p.subjectId,
    subjectName: p.subjectName,
    classId: p.classId,
    className: p.className,
    division: p.division,
    term: p.term,
    week: p.week,
    academicYear: currentYear,
    topic: p.topic ?? null,
    learningObjectives: p.learningObjectives ?? null,
    teachingMethods: p.teachingMethods ?? null,
    resources: p.resources ?? null,
    assessmentPlan: p.assessmentPlan ?? null,
    fileUrl: p.fileUrl ?? null,
    status: p.status,
    reviewerComment: p.reviewerComment ?? null,
    reviewedById: p.reviewedById ?? null,
    reviewedByName: p.reviewedByName ?? null,
    reviewedAt: p.reviewedAt ?? null,
    createdAt: p.createdAt ?? new Date().toISOString(),
    updatedAt: p.updatedAt ?? new Date().toISOString(),
  }));

  return <LessonPlansOversight plans={plans} />;
}
