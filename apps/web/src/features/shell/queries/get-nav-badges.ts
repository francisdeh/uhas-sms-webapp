import { getApi } from "@/lib/api/server";
import type { SessionUser } from "@/features/auth/types";

// Returns a map of nav href → pending count, computed per user.
export async function getNavBadges(user: SessionUser): Promise<Record<string, number>> {
  const badges: Record<string, number> = {};

  // The backend computes the count in a role-aware way — it returns 0 for
  // roles that don't have anything to review. We just map the single scalar
  // onto the href that role's dashboard uses.
  const api = await getApi();
  const { lessonPlansPendingReview } = await api.shell.navBadges();
  if (lessonPlansPendingReview > 0) {
    if (user.role === "DeputyHead") {
      badges["/deputy-head/lesson-plans"] = lessonPlansPendingReview;
    } else if (user.role === "Teacher" && user.isUnitHead) {
      badges["/teacher/reviews"] = lessonPlansPendingReview;
    }
  }

  return badges;
}
