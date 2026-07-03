import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { ReviewQueue } from "@/features/lesson-plans/components/ReviewQueue";
import { Card, CardContent } from "@/components/ui/card";
import type { LessonPlan } from "@/features/lesson-plans/types";

export default async function DeputyHeadLessonPlansPage() {
  const user = await getSessionUser();
  if (!user || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Lesson Plans</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No division assigned to your account.
          </CardContent>
        </Card>
      </div>
    );
  }

  const api = await getApi();
  const [pendingPage, approvedPage, rejectedPage] = await Promise.all([
    api.lessonPlans.list({ division, status: "unit_head_approved", size: 200 }),
    api.lessonPlans.list({ division, status: "approved", size: 200 }),
    api.lessonPlans.list({ division, status: "rejected", size: 200 }),
  ]);

  const pending = pendingPage.items as unknown as LessonPlan[];
  const recent = [...approvedPage.items, ...rejectedPage.items] as unknown as LessonPlan[];

  const recentMine = recent
    .filter((p) => p.reviewedById === user.linkedId)
    .slice(0, 10);

  return (
    <ReviewQueue
      reviewerId={user.linkedId}
      reviewerRole="DeputyHead"
      pending={pending}
      recent={recentMine}
    />
  );
}
