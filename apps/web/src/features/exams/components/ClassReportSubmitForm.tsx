"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send, Lock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { api, ApiError } from "@/lib/api/browser";
import type { Exam, ClassReportSubmission } from "@/features/exams/types";
import {
  CONDUCT_TRAITS,
  CONDUCT_TRAIT_LABELS,
  KG_DOMAINS,
  KG_DOMAIN_LABELS,
  RATINGS,
  CLASS_REPORT_SUBMISSION_STATUS,
  type ConductTrait,
  type KgDomain,
  type Rating,
} from "@/features/exams/types";
import { KG } from "@/features/auth/types";
import type { Division } from "@/features/auth/types";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";

interface ClassReportRow {
  studentId: string;
  studentName: string;
  aggregate: number | null;
  classTeacherRemark: string;
  conductRatings: Partial<Record<ConductTrait, Rating>>;
  kgObservations: Partial<Record<KgDomain, Rating>>;
  interestsCoCurricular: string;
}

interface ClassReportSubmitFormProps {
  exam: Exam;
  classId: string;
  className: string;
  division: Division;
  submittedById: string;
  submission: ClassReportSubmission | null;
  initialRows: ClassReportRow[];
}

export function ClassReportSubmitForm({
  exam,
  classId,
  className,
  division,
  submission,
  initialRows,
}: ClassReportSubmitFormProps) {
  useBreadcrumbLabel(exam.id, exam.name);
  useBreadcrumbLabel(classId, className);

  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const locked = exam.isPublished;
  const submitted = submission?.status === CLASS_REPORT_SUBMISSION_STATUS.SUBMITTED;
  const isKg = division === KG;

  function buildRemarksPayload() {
    return rows.map((r) => ({
      studentId: r.studentId,
      text: r.classTeacherRemark,
      conductRatings: r.conductRatings,
      kgObservations: isKg ? r.kgObservations : undefined,
      interestsCoCurricular: r.interestsCoCurricular,
    }));
  }

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      api.classReports.saveDraft(exam.id, classId, {
        remarks: buildRemarksPayload(),
      }),
    onSuccess: () => {
      toast.success("Draft saved.");
      router.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to save draft.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await api.classReports.saveDraft(exam.id, classId, {
        remarks: buildRemarksPayload(),
      });
      return api.classReports.submit(exam.id, classId);
    },
    onSuccess: () => {
      toast.success("Class report submitted to Head of School.");
      setConfirmOpen(false);
      router.refresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit report.");
    },
  });

  const isPending = saveDraftMutation.isPending || submitMutation.isPending;

  function updateRemark(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, classTeacherRemark: value } : r))
    );
  }

  function updateInterests(studentId: string, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, interestsCoCurricular: value } : r))
    );
  }

  function updateConductRating(studentId: string, trait: ConductTrait, value: Rating) {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, conductRatings: { ...r.conductRatings, [trait]: value } }
          : r
      )
    );
  }

  function updateKgObservation(studentId: string, domain: KgDomain, value: Rating) {
    setRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, kgObservations: { ...r.kgObservations, [domain]: value } }
          : r
      )
    );
  }

  function handleSaveDraft() {
    if (locked) return;
    saveDraftMutation.mutate();
  }

  function handleSubmit() {
    if (locked) return;

    const missing = rows.find((r) => !r.classTeacherRemark.trim());
    if (missing) {
      toast.error(`Add a remark for ${missing.studentName} before submitting.`);
      return;
    }

    submitMutation.mutate();
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

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Interests &amp; co-curricular activities
                </Label>
                <Input
                  placeholder="e.g. Debate club, football"
                  value={row.interestsCoCurricular}
                  onChange={(e) => updateInterests(row.studentId, e.target.value)}
                  disabled={locked}
                />
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Conduct</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CONDUCT_TRAITS.map((trait) => (
                    <RatingSelect
                      key={trait}
                      label={CONDUCT_TRAIT_LABELS[trait]}
                      value={row.conductRatings[trait]}
                      onChange={(v) => updateConductRating(row.studentId, trait, v)}
                      disabled={locked}
                    />
                  ))}
                </div>
              </div>

              {isKg && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">
                    Developmental observations
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {KG_DOMAINS.map((domain) => (
                      <RatingSelect
                        key={domain}
                        label={KG_DOMAIN_LABELS[domain]}
                        value={row.kgObservations[domain]}
                        onChange={(v) => updateKgObservation(row.studentId, domain, v)}
                        disabled={locked}
                      />
                    ))}
                  </div>
                </div>
              )}
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
          <Button variant="brand" onClick={() => setConfirmOpen(true)} disabled={isPending}>
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

function RatingSelect({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Rating | undefined;
  onChange: (value: Rating) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground mb-0.5 block">{label}</Label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => v && onChange(v as Rating)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs w-full">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {RATINGS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
