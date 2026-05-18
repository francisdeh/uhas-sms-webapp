import { redirect } from "next/navigation";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { listLessonPlansForReviewAction } from "@/features/lesson-plans/actions";
import { ReviewQueue } from "@/features/lesson-plans/components/ReviewQueue";
import { Card, CardContent } from "@/components/ui/card";

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

  const [pending, recent] = await Promise.all([
    listLessonPlansForReviewAction({
      division: user.unitHeadOf,
      status: "submitted",
    }),
    listLessonPlansForReviewAction({
      division: user.unitHeadOf,
      status: ["unit_head_approved", "rejected", "approved"],
    }),
  ]);

  // Limit recent to most recently reviewed by this user
  const recentMine = recent
    .filter((p) => p.reviewedById === user.linkedId)
    .slice(0, 10);

  return (
    <ReviewQueue
      reviewerId={user.linkedId}
      reviewerRole="UnitHead"
      pending={pending}
      recent={recentMine}
    />
  );
}
