import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { ReviewQueue } from "@/features/lesson-plans/components/ReviewQueue";
import { Card, CardContent } from "@/components/ui/card";
import { LESSON_PLAN_REVIEWER_ROLE, LESSON_PLAN_STATUS, type LessonPlan } from "@/features/lesson-plans/types";
import type { components } from "@/types/api";

function toLessonPlan(
  p: components["schemas"]["LessonPlanRead"],
  academicYear: string,
): LessonPlan {
  return {
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
    academicYear,
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
  };
}

export default async function TeacherReviewsPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  if (!user.isUnitHead || !user.unitHeadOf) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Reviews</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You are not assigned as a Unit Head. Ask Admin to set the Unit Head flag if you should have review access.
          </CardContent>
        </Card>
      </div>
    );
  }

  const api = await getApi();
  const [currentYear, pendingPage, unitHeadApprovedPage, rejectedPage, approvedPage] =
    await Promise.all([
      getCurrentAcademicYear(),
      api.lessonPlans.list({ division: user.unitHeadOf, status: LESSON_PLAN_STATUS.SUBMITTED, size: 200 }),
      api.lessonPlans.list({
        division: user.unitHeadOf,
        status: LESSON_PLAN_STATUS.UNIT_HEAD_APPROVED,
        size: 200,
      }),
      api.lessonPlans.list({ division: user.unitHeadOf, status: LESSON_PLAN_STATUS.REJECTED, size: 200 }),
      api.lessonPlans.list({ division: user.unitHeadOf, status: LESSON_PLAN_STATUS.APPROVED, size: 200 }),
    ]);

  const pending = pendingPage.items.map((p) => toLessonPlan(p, currentYear));
  const recent = [
    ...unitHeadApprovedPage.items,
    ...rejectedPage.items,
    ...approvedPage.items,
  ].map((p) => toLessonPlan(p, currentYear));

  // Limit recent to most recently reviewed by this user
  const recentMine = recent
    .filter((p) => p.reviewedById === user.linkedId)
    .slice(0, 10);

  return (
    <ReviewQueue
      reviewerId={user.linkedId}
      reviewerRole={LESSON_PLAN_REVIEWER_ROLE.UNIT_HEAD}
      pending={pending}
      recent={recentMine}
    />
  );
}
