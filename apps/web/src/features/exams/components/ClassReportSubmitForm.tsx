"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send, Lock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  saveClassReportDraftAction,
  submitClassReportAction,
} from "@/features/exams/actions";
import type { Exam, ClassReportSubmission } from "@/features/exams/types";

interface ClassReportSubmitFormProps {
  exam: Exam;
  classId: string;
  className: string;
  submittedById: string;
  submission: ClassReportSubmission | null;
  initialRows: {
    studentId: string;
    studentName: string;
    aggregate: number | null;
    classTeacherRemark: string;
  }[];
}

export function ClassReportSubmitForm({
  exam,
  classId,
  className,
  submittedById,
  submission,
  initialRows,
}: ClassReportSubmitFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const locked = exam.isPublished;
  const submitted = submission?.status === "submitted";

  function updateRemark(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, classTeacherRemark: value } : r))
    );
  }

  function handleSaveDraft() {
    if (locked) return;
    startTransition(async () => {
      const result = await saveClassReportDraftAction({
        examId: exam.id,
        classId,
        remarks: rows.map((r) => ({
          studentId: r.studentId,
          classTeacherRemark: r.classTeacherRemark,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Draft saved.");
      router.refresh();
    });
  }

  function handleSubmit() {
    if (locked) return;

    const missing = rows.find((r) => !r.classTeacherRemark.trim());
    if (missing) {
      toast.error(`Add a remark for ${missing.studentName} before submitting.`);
      return;
    }

    startTransition(async () => {
      const result = await submitClassReportAction({
        examId: exam.id,
        classId,
        submittedById,
        remarks: rows.map((r) => ({
          studentId: r.studentId,
          classTeacherRemark: r.classTeacherRemark,
        })),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Class report submitted to Head of School.");
      setConfirmOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Class Report — {exam.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {className} · Term {exam.term} · {exam.academicYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {locked && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              <Lock size={11} className="mr-1" /> Published
            </Badge>
          )}
          {submitted ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Submitted</Badge>
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )}
        </div>
      </div>

      {locked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
          <AlertDescription>
            This exam has been published. Remarks are locked. Ask Admin to unpublish to edit.
          </AlertDescription>
        </Alert>
      )}

      {submitted && !locked && (
        <Alert className="border-blue-200 bg-blue-50 text-blue-800">
          <AlertDescription>
            Submitted to Head of School. You can still edit and re-save the draft until the exam is published.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {rows.length === 0 && (
          <EmptyState
            size="compact"
            icon={Users}
            title="No active students in this class"
            description="Register or reactivate students for this class before submitting a report."
          />
        )}

        {rows.map((row) => (
          <Card key={row.studentId}>
            <CardContent className="py-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm font-medium">{row.studentName}</p>
                <span className="text-xs text-muted-foreground">
                  Aggregate: <span className="font-semibold tabular-nums">{row.aggregate ?? "—"}</span>
                </span>
              </div>
              <Textarea
                placeholder="Class teacher's remarks…"
                value={row.classTeacherRemark}
                onChange={(e) => updateRemark(row.studentId, e.target.value)}
                disabled={locked}
                rows={2}
                className="resize-none"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {!locked && rows.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Save draft
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={isPending}>
            <Send size={14} className="mr-1.5" />
            {submitted ? "Re-submit" : "Submit to Head of School"}
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit class report?</AlertDialogTitle>
            <AlertDialogDescription>
              The Head of School will review your remarks and may add final comments before
              publishing report cards to parents. You can still edit and re-save until the
              exam is published.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
