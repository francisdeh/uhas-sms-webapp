import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/features/auth/queries/get-session-user";
import { getSubmissionById } from "@/features/promotions/queries/get-submission";
import { PromotionDecisionTable } from "@/features/promotions/components/PromotionDecisionTable";
import { Badge } from "@/components/ui/badge";

export default async function AdminPromotionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.role !== "Admin") redirect("/login");

  const { submissionId } = await params;
  const detail = await getSubmissionById(submissionId);
  if (!detail) notFound();

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
      </div>

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
