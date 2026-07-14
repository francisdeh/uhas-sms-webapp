import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Lock, Check, ClipboardList } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi } from "@/lib/api/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PROMOTION_SEASON_STATUS,
  PROMOTION_SUBMISSION_STATUS,
  type PromotionSubmissionStatus,
} from "@/features/promotions/types";
import { DEPUTY_HEAD } from "@/features/auth/types";

function statusPill(status: PromotionSubmissionStatus) {
  switch (status) {
    case PROMOTION_SUBMISSION_STATUS.SUBMITTED:
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Pending review</Badge>;
    case PROMOTION_SUBMISSION_STATUS.APPROVED:
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
          <Check size={10} className="mr-1" /> Approved
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.SENT_BACK:
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">Sent back</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px]">Draft</Badge>;
  }
}

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
          <CardContent className="pt-0 space-y-1">
            {queue.map((row) => (
              <Link
                key={row.submission.id}
                href={`/deputy-head/promotions/${row.submission.id}`}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors group"
              >
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">{row.className}</p>
                  {statusPill(row.submission.status as PromotionSubmissionStatus)}
                  {row.submission.submittedByName && (
                    <span className="text-xs text-muted-foreground">
                      by {row.submission.submittedByName}
                    </span>
                  )}
                  {row.submission.submittedAt && (
                    <span className="text-xs text-muted-foreground">
                      · {new Date(row.submission.submittedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
