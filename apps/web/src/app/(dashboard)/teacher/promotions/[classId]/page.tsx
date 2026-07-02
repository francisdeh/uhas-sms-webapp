import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, AlertTriangle } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getCurrentSeason } from "@/features/promotions/queries/get-season";
import { getTeacherPromotionClasses } from "@/features/promotions/queries/get-teacher-classes";
import { getSubmissionByClassId } from "@/features/promotions/queries/get-submission";
import { ensureSubmissionAction } from "@/features/promotions/actions";
import { PromotionDecisionTable } from "@/features/promotions/components/PromotionDecisionTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export default async function TeacherPromotionClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "Teacher" || !user.linkedId) redirect("/login");

  const { classId } = await params;

  const [season, myClasses] = await Promise.all([
    getCurrentSeason(),
    getTeacherPromotionClasses(user.linkedId),
  ]);

  if (!season.isOpen) redirect("/teacher/promotions");

  const myClass = myClasses.find((c) => c.classId === classId);
  if (!myClass) notFound();

  // Initialise the submission + decision rows on first visit. Safe to re-run
  // because the action is idempotent for existing rows.
  if (myClass.isPrimary) {
    await ensureSubmissionAction(classId);
  }

  const detail = await getSubmissionByClassId(classId);
  if (!detail) {
    return (
      <EmptyState
        icon={Lock}
        title="Not initialised"
        description="A primary class teacher needs to open this page first to create the draft."
      />
    );
  }

  const readonly = !myClass.isPrimary || detail.submission.status !== "draft";
  const isSubmitted = detail.submission.status === "submitted";
  const isApproved = detail.submission.status === "approved";
  const isSentBack = detail.submission.status === "sent_back";

  // Sent-back state should remain editable for the primary teacher.
  const finalMode = isSentBack && myClass.isPrimary ? "edit" : readonly ? "readonly" : "edit";

  const noNextYearClasses = detail.nextYearClasses.length === 0;

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/promotions"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={12} /> Back to promotions
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold">{detail.className} — promotion list</h1>
          {isSubmitted && (
            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Submitted</Badge>
          )}
          {isApproved && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Approved</Badge>
          )}
          {isSentBack && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Sent back</Badge>
          )}
          {!isSubmitted && !isApproved && !isSentBack && (
            <Badge variant="secondary">Draft</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {detail.division} · → {detail.nextAcademicYear}
        </p>
      </div>

      {!myClass.isPrimary && (
        <Alert>
          <AlertDescription>
            You are listed as a class teacher but not the primary one. View-only.
          </AlertDescription>
        </Alert>
      )}

      {isSentBack && detail.submission.reviewerComment && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertTriangle size={14} />
          <AlertDescription>
            <span className="font-medium">Deputy Head sent back:</span>{" "}
            {detail.submission.reviewerComment}
          </AlertDescription>
        </Alert>
      )}

      {isSubmitted && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <AlertDescription>
            Submitted to Deputy Head. You can edit again if it gets sent back.
          </AlertDescription>
        </Alert>
      )}

      {isApproved && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <AlertDescription>
            Approved. Next-year enrollments have been recorded.
          </AlertDescription>
        </Alert>
      )}

      {noNextYearClasses ? (
        <EmptyState
          icon={Lock}
          title={`No ${detail.nextAcademicYear} classes for ${detail.division}`}
          description="Ask Admin to set up next year's classes before you can submit this list."
        />
      ) : (
        <PromotionDecisionTable
          mode={finalMode}
          classId={classId}
          submissionId={detail.submission.id}
          className={detail.className}
          nextAcademicYear={detail.nextAcademicYear}
          nextYearClasses={detail.nextYearClasses}
          initial={detail.decisions}
          submittedById={user.linkedId}
          overrideMode={season.season?.openedWithOverride ?? false}
        />
      )}
    </div>
  );
}
