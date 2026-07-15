import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getDeputyHeadDivision } from "@/features/students/queries/get-deputy-head-division";
import { getApi, ApiError } from "@/lib/api/server";
import { PromotionDecisionTable } from "@/features/promotions/components/PromotionDecisionTable";
import { PromotionCommentThread } from "@/features/promotions/components/PromotionCommentThread";
import { ReviewFooter } from "@/features/promotions/components/ReviewFooter";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PROMOTION_SUBMISSION_STATUS, type DecisionRowView } from "@/features/promotions/types";
import { DEPUTY_HEAD } from "@/features/auth/types";

export default async function DeputyHeadPromotionReviewPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== DEPUTY_HEAD || !user.linkedId) redirect("/login");

  const division = await getDeputyHeadDivision(user.linkedId);
  if (!division) redirect("/deputy-head/promotions");

  const { submissionId } = await params;
  const api = await getApi();
  let detail;
  try {
    detail = await api.promotions.getSubmission(submissionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // 403 if the submission isn't in this DH's division.
  if (detail.division !== division) redirect("/deputy-head/promotions");

  const season = await api.promotions.getSeason();
  const isSubmitted = detail.submission.status === PROMOTION_SUBMISSION_STATUS.SUBMITTED;

  const decisions: DecisionRowView[] = detail.decisions.map((d) => ({
    decision: {
      id: d.id,
      submissionId: d.submissionId,
      studentId: d.studentId,
      decision: d.decision,
      targetClassId: d.targetClassId ?? null,
      reason: d.reason ?? null,
      suggestedDecision: d.suggestedDecision ?? null,
      suggestedReason: d.suggestedReason ?? null,
      failedCoreSubjects: d.failedCoreSubjects ?? null,
    },
    studentName: d.studentName,
    studentPhotoUrl: d.studentPhotoUrl ?? null,
  }));

  return (
    <div className="space-y-4">
      <Link
        href="/deputy-head/promotions"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={12} /> Back to queue
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold">{detail.className} — promotion list</h1>
          <Badge variant="secondary" className="text-[10px] capitalize">
            {detail.submission.status.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {detail.division} · → {detail.nextAcademicYear}
          {detail.submission.submittedByName
            ? ` · submitted by ${detail.submission.submittedByName}`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {detail.classTeachers.length > 0
            ? `Class teacher${detail.classTeachers.length === 1 ? "" : "s"}: ${detail.classTeachers.map((t) => t.staffName).join(", ")}`
            : "No class teacher assigned"}
        </p>
      </div>

      {detail.submission.status === PROMOTION_SUBMISSION_STATUS.APPROVED && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <AlertDescription>
            Approved on{" "}
            {detail.submission.reviewedAt
              ? new Date(detail.submission.reviewedAt).toLocaleString()
              : "—"}{" "}
            — enrollments recorded.
          </AlertDescription>
        </Alert>
      )}

      <PromotionCommentThread comments={detail.comments} />

      <PromotionDecisionTable
        mode="readonly"
        classId={detail.submission.classId}
        submissionId={detail.submission.id}
        className={detail.className}
        nextAcademicYear={detail.nextAcademicYear}
        nextYearClasses={detail.nextYearClasses}
        initial={decisions}
        overrideMode={season?.openedWithOverride ?? false}
      />

      {isSubmitted && (
        <ReviewFooter
          submissionId={detail.submission.id}
          reviewedById={user.linkedId}
          redirectTo="/deputy-head/promotions"
        />
      )}
    </div>
  );
}
