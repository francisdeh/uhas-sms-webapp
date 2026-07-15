import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getApi, ApiError } from "@/lib/api/server";
import { PromotionDecisionTable } from "@/features/promotions/components/PromotionDecisionTable";
import { PromotionCommentThread } from "@/features/promotions/components/PromotionCommentThread";
import { Badge } from "@/components/ui/badge";
import type {
  DecisionRowView,
  PromotionSubmission,
} from "@/features/promotions/types";
import { ADMIN } from "@/features/auth/types";

export default async function AdminPromotionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== ADMIN) redirect("/login");

  const { submissionId } = await params;
  const api = await getApi();
  let raw;
  try {
    raw = await api.promotions.getSubmission(submissionId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const submission: PromotionSubmission = {
    id: raw.submission.id,
    schoolId: raw.submission.schoolId,
    classId: raw.submission.classId,
    academicYear: raw.submission.academicYear,
    status: raw.submission.status,
    submittedById: raw.submission.submittedById ?? null,
    submittedByName: raw.submission.submittedByName ?? null,
    submittedAt: raw.submission.submittedAt ?? null,
    reviewedById: raw.submission.reviewedById ?? null,
    reviewedByName: raw.submission.reviewedByName ?? null,
    reviewedAt: raw.submission.reviewedAt ?? null,
  };

  const decisions: DecisionRowView[] = raw.decisions.map((d) => ({
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

  const detail = {
    submission,
    className: raw.className,
    division: raw.division,
    nextAcademicYear: raw.nextAcademicYear,
    nextYearClasses: raw.nextYearClasses.map((c) => ({ id: c.id, name: c.name })),
    decisions,
    classTeachers: raw.classTeachers.map((t) => ({
      staffId: t.staffId,
      staffName: t.staffName,
      isPrimary: t.isPrimary,
    })),
    comments: raw.comments.map((c) => ({
      id: c.id,
      authorId: c.authorId,
      authorName: c.authorName,
      body: c.body,
      createdAt: c.createdAt ?? null,
    })),
  };

  return (
    <div className="space-y-4">
      <Link
        href="/admin/promotions"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={12} /> Back to promotions
      </Link>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold">{detail.className} — promotion list</h1>
          <Badge variant="secondary" className="text-[10px]">
            {detail.submission.status}
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

      <PromotionCommentThread comments={detail.comments} />

      <PromotionDecisionTable
        mode="readonly"
        classId={detail.submission.classId}
        submissionId={detail.submission.id}
        className={detail.className}
        nextAcademicYear={detail.nextAcademicYear}
        nextYearClasses={detail.nextYearClasses}
        initial={detail.decisions}
      />
    </div>
  );
}
