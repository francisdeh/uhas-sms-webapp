import { mockLessonPlans } from "@/lib/mock/lesson-plans";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import type { SessionUser } from "@/features/auth/types";

// Returns a map of nav href → unread/pending count, computed per user
// based on their role + scope. The Sidebar overlays these onto the static
// nav config so badges always reflect current state.
export async function getNavBadges(user: SessionUser): Promise<Record<string, number>> {
  if (process.env.USE_MOCK_DATA !== "true") return {};

  const year = await getCurrentAcademicYear();
  const badges: Record<string, number> = {};

  if (user.role === "DeputyHead" && user.linkedId) {
    const division = await getDeputyHeadDivision(user.linkedId);
    if (division) {
      const pendingPlans = mockLessonPlans.filter(
        (p) =>
          p.academicYear === year &&
          p.division === division &&
          p.status === "unit_head_approved"
      ).length;
      if (pendingPlans > 0) {
        badges["/deputy-head/lesson-plans"] = pendingPlans;
      }
    }
  }

  if (user.role === "Teacher" && user.isUnitHead && user.unitHeadOf) {
    const pendingReviews = mockLessonPlans.filter(
      (p) =>
        p.academicYear === year &&
        p.division === user.unitHeadOf &&
        p.status === "submitted"
    ).length;
    if (pendingReviews > 0) {
      badges["/teacher/reviews"] = pendingReviews;
    }
  }

  return badges;
}
