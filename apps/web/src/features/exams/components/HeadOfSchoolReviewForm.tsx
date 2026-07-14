"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Lock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { api, ApiError } from "@/lib/api/browser";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import { CLASS_REPORT_SUBMISSION_STATUS, type Exam, type ClassReportSubmission } from "@/features/exams/types";

interface HeadOfSchoolReviewFormProps {
  exam: Exam;
  classId: string;
  className: string;
  submission: ClassReportSubmission | null;
  initialRows: {
    studentId: string;
    studentName: string;
    aggregate: number | null;
    classTeacherRemark: string;
    headOfSchoolComment: string;
  }[];
}

export function HeadOfSchoolReviewForm({
  exam,
  classId: routeClassId,
  className,
  submission,
  initialRows,
}: HeadOfSchoolReviewFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [savingId, setSavingId] = useState<string | null>(null);

  useBreadcrumbLabel(exam.id, exam.name);
  useBreadcrumbLabel(routeClassId, className);

  const locked = exam.isPublished;
  const classId = submission?.classId ?? null;

  const saveMutation = useMutation({
    mutationFn: ({ hosComment }: { studentId: string; hosComment: string }) => {
      if (!classId) {
        throw new Error("No class report submission to update.");
      }
      return api.classReports.updateHosComment(exam.id, classId, {
        hosComment,
      });
    },
    onSuccess: (_data, { studentId }) => {
      const row = rows.find((r) => r.studentId === studentId);
      toast.success(row ? `Saved comment for ${row.studentName}.` : "Saved comment.");
      setSavingId(null);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : err.message ?? "Failed to save comment.");
      setSavingId(null);
    },
  });

  const isPending = saveMutation.isPending;

  function updateComment(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, headOfSchoolComment: value } : r))
    );
  }

  function saveComment(studentId: string) {
    if (locked) return;
    const row = rows.find((r) => r.studentId === studentId);
    if (!row) return;

    setSavingId(studentId);
    saveMutation.mutate({ studentId, hosComment: row.headOfSchoolComment });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Review — {exam.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {className} · Term {exam.term} · {exam.academicYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {submission?.status === CLASS_REPORT_SUBMISSION_STATUS.SUBMITTED && (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Submitted</Badge>
          )}
          {locked && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              <Lock size={11} className="mr-1" /> Published
            </Badge>
          )}
        </div>
      </div>

      {locked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertDescription>
            This exam has been published. Comments are locked. Unpublish from the Examinations page to edit.
          </AlertDescription>
        </Alert>
      )}

      {!submission && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription>
            The class teacher has not submitted this report yet. You can still add comments to draft state if needed.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {rows.length === 0 && (
          <EmptyState
            size="compact"
            icon={Users}
            title="No active students in this class"
            description="Ask Admin to register or reactivate students before reviewing."
          />
        )}

        {rows.map((row) => (
          <Card key={row.studentId}>
            <CardContent className="py-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm font-medium">{row.studentName}</p>
                <span className="text-xs text-muted-foreground">
                  Aggregate: <span className="font-semibold tabular-nums">{row.aggregate ?? "—"}</span>
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Class teacher&apos;s remark
                </p>
                <p className="text-sm bg-muted/40 rounded p-2 min-h-[2.5rem]">
                  {row.classTeacherRemark || (
                    <span className="text-muted-foreground italic">— No remark —</span>
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Head of School&apos;s comment
                </p>
                <Textarea
                  placeholder="Add your final comment…"
                  value={row.headOfSchoolComment}
                  onChange={(e) => updateComment(row.studentId, e.target.value)}
                  disabled={locked}
                  rows={2}
                  className="resize-none"
                />
                {!locked && (
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveComment(row.studentId)}
                      disabled={isPending && savingId === row.studentId}
                    >
                      {isPending && savingId === row.studentId ? (
                        <Loader2 size={12} className="animate-spin mr-1.5" />
                      ) : (
                        <Save size={12} className="mr-1.5" />
                      )}
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
