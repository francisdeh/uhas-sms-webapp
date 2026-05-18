import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listLessonPlansForReviewAction } from "@/features/lesson-plans/actions";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { ReviewQueue } from "@/features/lesson-plans/components/ReviewQueue";
import { Card, CardContent } from "@/components/ui/card";

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

  const [pending, recent] = await Promise.all([
    listLessonPlansForReviewAction({
      division,
      status: "unit_head_approved",
    }),
    listLessonPlansForReviewAction({
      division,
      status: ["approved", "rejected"],
    }),
  ]);

  const recentMine = recent.filter((p) => p.reviewedById === user.linkedId).slice(0, 10);

  return (
    <ReviewQueue
      reviewerId={user.linkedId}
      reviewerRole="DeputyHead"
      pending={pending}
      recent={recentMine}
    />
  );
}
