import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Users, Lock, Check, ClipboardList } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi } from "@/lib/api/server";
import { getCurrentAcademicYear } from "@/lib/academic-year-server";
import { PromotionSeasonHeader } from "@/features/promotions/components/PromotionSeasonHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ADMIN, DIVISIONS } from "@/features/auth/types";
import {
  PROMOTION_SUBMISSION_STATUS,
  type ClassOverviewRow,
  type PromotionSeason,
  type PromotionSubmission,
  type PromotionSubmissionStatus,
} from "@/features/promotions/types";

const DIVISION_ORDER = DIVISIONS;

function statusPill(status: PromotionSubmissionStatus | undefined) {
  switch (status) {
    case PROMOTION_SUBMISSION_STATUS.SUBMITTED:
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
          Submitted
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.APPROVED:
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
          <Check size={10} className="mr-1" /> Approved
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.SENT_BACK:
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
          Sent back
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.DRAFT:
      return <Badge variant="secondary" className="text-[10px]">Draft</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">Not started</Badge>;
  }
}

export default async function AdminPromotionsPage() {
  const user = await getSessionUser();
  if (!user || user.role !== ADMIN) redirect("/login");

  const api = await getApi();
  const [seasonRow, overviewResp, academicYear, term3ExamStatus] = await Promise.all([
    api.promotions.getSeason(),
    api.promotions.getOverview(),
    getCurrentAcademicYear(),
    api.promotions.getTerm3ExamStatus(),
  ]);

  const season: PromotionSeason | null = seasonRow
    ? {
        id: seasonRow.id,
        schoolId: seasonRow.schoolId,
        academicYear: seasonRow.academicYear,
        status: seasonRow.status,
        openedWithOverride: seasonRow.openedWithOverride ?? false,
        openedById: seasonRow.openedById ?? null,
        openedByName: seasonRow.openedByName ?? null,
        openedAt: seasonRow.openedAt ?? null,
        closedById: seasonRow.closedById ?? null,
        closedByName: seasonRow.closedByName ?? null,
        closedAt: seasonRow.closedAt ?? null,
        hasPublishedTerm3EndOfTerm: seasonRow.hasPublishedTerm3EndOfTerm,
      }
    : null;

  const toSubmission = (
    s: NonNullable<(typeof overviewResp.items)[number]["submission"]>,
  ): PromotionSubmission => ({
    id: s.id,
    schoolId: s.schoolId,
    classId: s.classId,
    academicYear: s.academicYear,
    status: s.status,
    submittedById: s.submittedById ?? null,
    submittedByName: s.submittedByName ?? null,
    submittedAt: s.submittedAt ?? null,
    reviewedById: s.reviewedById ?? null,
    reviewedByName: s.reviewedByName ?? null,
    reviewedAt: s.reviewedAt ?? null,
  });

  const overview: ClassOverviewRow[] = overviewResp.items.map((r) => ({
    classId: r.classId,
    className: r.className,
    division: r.division,
    classTeachers: r.classTeachers,
    totalStudents: r.totalStudents,
    decidedCount: r.decidedCount,
    submission: r.submission ? toSubmission(r.submission) : null,
  }));

  const term3EndOfTermPublished = term3ExamStatus.hasPublishedTerm3EndOfTerm;

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
        season={season}
        academicYear={academicYear}
        staffId={user.linkedId}
        term3EndOfTermPublished={term3EndOfTermPublished}
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
                        {primary ? (
                          <span className="text-xs text-muted-foreground">
                            · {primary.staffName}
                          </span>
                        ) : (
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
