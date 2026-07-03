import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { LessonPlanForm } from "@/features/lesson-plans/components/LessonPlanForm";
import type { LessonPlan } from "@/features/lesson-plans/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditLessonPlanPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const api = await getApi();
  let planRead;
  try {
    planRead = await api.lessonPlans.get(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  if (planRead.teacherId !== user.linkedId) notFound();

  const currentYear = await getCurrentAcademicYear();
  const plan: LessonPlan = {
    id: planRead.id,
    schoolId: planRead.schoolId,
    teacherId: planRead.teacherId,
    teacherName: `${planRead.teacherFirstName} ${planRead.teacherLastName}`.trim(),
    subjectId: planRead.subjectId,
    subjectName: planRead.subjectName,
    classId: planRead.classId,
    className: planRead.className,
    division: planRead.division,
    term: planRead.term,
    week: planRead.week,
    academicYear: currentYear,
    topic: planRead.topic ?? null,
    learningObjectives: planRead.learningObjectives ?? null,
    teachingMethods: planRead.teachingMethods ?? null,
    resources: planRead.resources ?? null,
    assessmentPlan: planRead.assessmentPlan ?? null,
    fileUrl: planRead.fileUrl ?? null,
    status: planRead.status,
    reviewerComment: planRead.reviewerComment ?? null,
    reviewedById: planRead.reviewedById ?? null,
    reviewedByName: planRead.reviewedByName ?? null,
    reviewedAt: planRead.reviewedAt ?? null,
    createdAt: planRead.createdAt ?? new Date().toISOString(),
    updatedAt: planRead.updatedAt ?? new Date().toISOString(),
  };

  const { rows } = await api.classSubjects.listByTeacher(user.linkedId);
  const flat = rows.map((r) => ({
    classId: r.classId,
    className: r.className,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
  }));

  // Always include the existing class/subject even if no longer assigned
  if (!flat.some((a) => a.classId === plan.classId && a.subjectId === plan.subjectId)) {
    flat.push({
      classId: plan.classId,
      className: plan.className,
      subjectId: plan.subjectId,
      subjectName: plan.subjectName,
    });
  }

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/lesson-plans"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to lesson plans
      </Link>
      <LessonPlanForm
        teacherId={user.linkedId}
        existing={plan}
        assignments={flat}
        backHref="/teacher/lesson-plans"
      />
    </div>
  );
}
