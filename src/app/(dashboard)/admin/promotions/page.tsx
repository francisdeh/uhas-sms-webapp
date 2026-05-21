import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, Lock, Check, ClipboardList } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentSeason } from "@/features/promotions/queries/get-season";
import { getPromotionOverview } from "@/features/promotions/queries/get-overview";
import { PromotionSeasonHeader } from "@/features/promotions/components/PromotionSeasonHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Division } from "@/features/auth/types";
import type { PromotionSubmissionStatus } from "@/features/promotions/types";

const DIVISION_ORDER: Division[] = ["KG", "Lower Primary", "Upper Primary", "JHS"];

function statusPill(status: PromotionSubmissionStatus | undefined) {
  switch (status) {
    case "submitted":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
          Submitted
        </Badge>
      );
    case "approved":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
          <Check size={10} className="mr-1" /> Approved
        </Badge>
      );
    case "sent_back":
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
          Sent back
        </Badge>
      );
    case "draft":
      return <Badge variant="secondary" className="text-[10px]">Draft</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">Not started</Badge>;
  }
}

export default async function AdminPromotionsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") redirect("/login");

  const [season, overview] = await Promise.all([
    getCurrentSeason(),
    getPromotionOverview(),
  ]);

  const byDivision = DIVISION_ORDER.map((division) => ({
    division,
    rows: overview
      .filter((r) => r.division === division)
      .sort((a, b) => a.className.localeCompare(b.className)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Student Promotions</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          End-of-year promotion workflow. Open the season to let class teachers submit their
          per-student decisions; Deputy Heads approve per class.
        </p>
      </div>

      <PromotionSeasonHeader
        season={season.season}
        academicYear={season.academicYear}
        staffId={user.linkedId}
        term3EndOfTermPublished={season.term3EndOfTermPublished}
      />

      {byDivision.every((g) => g.rows.length === 0) ? (
        <EmptyState
          icon={ClipboardList}
          title="No classes set up"
          description="Create classes in the current academic year before opening a promotion season."
        />
      ) : (
        byDivision.map(({ division, rows }) =>
          rows.length === 0 ? null : (
            <Card key={division}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{division}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {rows.map((row) => {
                  const primary =
                    row.classTeachers.find((t) => t.isPrimary) ?? row.classTeachers[0];
                  const linkable = !!row.submission;
                  const Wrapper: React.ElementType = linkable ? Link : "div";
                  return (
                    <Wrapper
                      key={row.classId}
                      {...(linkable
                        ? { href: `/admin/promotions/${row.submission!.id}` }
                        : {})}
                      className={`flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md transition-colors ${
                        linkable ? "hover:bg-muted/50 group cursor-pointer" : "opacity-75"
                      }`}
                    >
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{row.className}</p>
                        {statusPill(row.submission?.status)}
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Users size={11} /> {row.totalStudents}
                        </span>
                        {row.submission && (
                          <span className="text-xs text-muted-foreground">
                            · {row.decidedCount}/{row.totalStudents} decided
                          </span>
                        )}
                        {!primary && (
                          <Badge variant="outline" className="text-[10px]">
                            <Lock size={10} className="mr-1" /> No class teacher
                          </Badge>
                        )}
                      </div>
                      {linkable && (
                        <ChevronRight
                          size={14}
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        />
                      )}
                    </Wrapper>
                  );
                })}
              </CardContent>
            </Card>
          )
        )
      )}
    </div>
  );
}
