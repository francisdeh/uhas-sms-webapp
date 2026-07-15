import { redirect } from "next/navigation";
import { Lock, ClipboardList } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PromotionReviewQueue } from "@/features/promotions/components/PromotionReviewQueue";
import { PROMOTION_SEASON_STATUS } from "@/features/promotions/types";
import { DEPUTY_HEAD } from "@/features/auth/types";

export default async function DeputyHeadPromotionsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== DEPUTY_HEAD || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) {
    return (
      <EmptyState
        icon={Lock}
        title="No division assigned"
        description="Your account doesn't have a division. Contact Admin."
      />
    );
  }

  const api = await getApi();
  const [school, season, queueResponse] = await Promise.all([
    api.school.get(),
    api.promotions.getSeason(),
    api.promotions.getDhQueue(),
  ]);

  const academicYear = season?.academicYear ?? school.academicYear;
  const isOpen = season?.status === PROMOTION_SEASON_STATUS.OPEN;
  const queue = queueResponse.items;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Promotion Reviews</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {division} · {academicYear} → next academic year
        </p>
      </div>

      {!isOpen ? (
        <EmptyState
          icon={Lock}
          title="Promotion season is closed"
          description="Ask Admin to open the promotion season for the current academic year."
        />
      ) : queue.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing to review yet"
          description="Class teachers in your division haven't submitted promotion lists yet."
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Queue</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <PromotionReviewQueue queue={queue} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
