"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Send, GraduationCap, Sparkles, XCircle, RotateCcw, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useSavePromotionDraft,
  useSubmitPromotionList,
  useEnsurePromotionSubmission,
} from "@/features/promotions/hooks/use-promotions";
import {
  PROMOTION_DECISION_KIND,
  type DecisionRowView,
  type PromotionDecisionKind,
} from "@/features/promotions/types";

type Mode = "edit" | "readonly";

type Props = {
  mode: Mode;
  classId: string;
  /** Present when a submission already exists for this class this year.
   *  When absent, saves/submits create one first via `ensureSubmission`. */
  submissionId?: string | null;
  className: string;
  nextAcademicYear: string;
  nextYearClasses: { id: string; name: string }[];
  initial: DecisionRowView[];
  submittedById?: string;
  overrideMode?: boolean;
};

type RowState = {
  studentId: string;
  studentName: string;
  decision: PromotionDecisionKind;
  targetClassId: string | null;
  reason: string;
  suggestedDecision: PromotionDecisionKind | null;
  suggestedReason: string | null;
  failedCoreSubjects: number | null;
};

const DECISION_OPTIONS: Record<
  "primary" | "jhs3",
  { value: PromotionDecisionKind; label: string }[]
> = {
  primary: [
    { value: "promote", label: "Promote" },
    { value: "repeat", label: "Repeat" },
    { value: "withdraw", label: "Withdraw" },
  ],
  jhs3: [
    { value: "graduate", label: "Graduate" },
    { value: "repeat", label: "Repeat" },
  ],
};

function isJhs3(className: string): boolean {
  return className === "JHS 3" || className.startsWith("JHS 3");
}

function decisionPillClass(decision: PromotionDecisionKind): string {
  switch (decision) {
    case "promote":
      return "bg-green-100 text-green-700 hover:bg-green-100";
    case "graduate":
      return "bg-blue-100 text-blue-700 hover:bg-blue-100";
    case "repeat":
      return "bg-amber-100 text-amber-700 hover:bg-amber-100";
    case "withdraw":
      return "bg-rose-100 text-rose-700 hover:bg-rose-100";
  }
}

function decisionIcon(decision: PromotionDecisionKind) {
  switch (decision) {
    case "promote":
      return Sparkles;
    case "graduate":
      return GraduationCap;
    case "repeat":
      return RotateCcw;
    case "withdraw":
      return XCircle;
  }
}

export function PromotionDecisionTable({
  mode,
  classId,
  submissionId: initialSubmissionId,
  className,
  nextAcademicYear,
  nextYearClasses,
  initial,
  submittedById,
  overrideMode,
}: Props) {
  const router = useRouter();
  const [submissionId, setSubmissionId] = useState<string | null>(
    initialSubmissionId ?? null,
  );
  const ensureMut = useEnsurePromotionSubmission();
  const saveMut = useSavePromotionDraft();
  const submitMut = useSubmitPromotionList();
  // Teacher identity comes from the JWT now.
  void submittedById;

  async function resolveSubmissionId(): Promise<string> {
    if (submissionId) return submissionId;
    const res = await ensureMut.mutateAsync({ classId });
    setSubmissionId(res.submissionId);
    return res.submissionId;
  }
  const [rows, setRows] = useState<RowState[]>(() =>
    initial.map((r) => ({
      studentId: r.decision.studentId,
      studentName: r.studentName,
      decision: r.decision.decision,
      targetClassId: r.decision.targetClassId,
      reason: r.decision.reason ?? "",
      suggestedDecision: r.decision.suggestedDecision,
      suggestedReason: r.decision.suggestedReason,
      failedCoreSubjects: r.decision.failedCoreSubjects,
    }))
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isPending =
    ensureMut.isPending || saveMut.isPending || submitMut.isPending;

  const jhs3 = isJhs3(className);
  const options = jhs3 ? DECISION_OPTIONS.jhs3 : DECISION_OPTIONS.primary;
  const readonly = mode === "readonly";

  function patch(studentId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r))
    );
  }

  function buildUpdates() {
    return rows.map((r) => ({
      studentId: r.studentId,
      decision: r.decision,
      targetClassId:
        r.decision === PROMOTION_DECISION_KIND.PROMOTE
          ? r.targetClassId
          : null,
      reason:
        r.decision === PROMOTION_DECISION_KIND.REPEAT ||
        r.decision === PROMOTION_DECISION_KIND.WITHDRAW
          ? r.reason.trim() || null
          : null,
    }));
  }

  async function handleSaveDraft() {
    try {
      const id = await resolveSubmissionId();
      await saveMut.mutateAsync({
        id,
        payload: { updates: buildUpdates() },
      });
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function handleSubmit() {
    for (const r of rows) {
      if (
        r.decision === PROMOTION_DECISION_KIND.PROMOTE &&
        !r.targetClassId
      ) {
        toast.error(`${r.studentName}: pick a target class for the promotion.`);
        return;
      }
      if (
        (r.decision === PROMOTION_DECISION_KIND.REPEAT ||
          r.decision === PROMOTION_DECISION_KIND.WITHDRAW) &&
        !r.reason.trim()
      ) {
        toast.error(`${r.studentName}: add a reason for ${r.decision}.`);
        return;
      }
    }

    try {
      const id = await resolveSubmissionId();
      await submitMut.mutateAsync({
        id,
        payload: { updates: buildUpdates() },
      });
      setConfirmOpen(false);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={Users}
        title="No active students in this class"
        description="Register or reactivate students before submitting a promotion list."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {rows.map((row) => {
          const DecisionIcon = decisionIcon(row.decision);
          return (
            <Card key={row.studentId}>
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.studentName}</p>
                    {!overrideMode && row.suggestedDecision && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Suggested:{" "}
                        <span className="font-medium capitalize">{row.suggestedDecision}</span>
                        {row.suggestedReason ? ` — ${row.suggestedReason}` : ""}
                      </p>
                    )}
                  </div>
                  <Badge className={decisionPillClass(row.decision)}>
                    <DecisionIcon size={11} className="mr-1" />
                    <span className="capitalize">{row.decision}</span>
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 sm:items-start">
                  <div>
                    <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                      Decision
                    </label>
                    <Select
                      value={row.decision}
                      disabled={readonly}
                      onValueChange={(v) => {
                        const next = v as PromotionDecisionKind;
                        const targetClassId =
                          next === "promote"
                            ? row.targetClassId ?? nextYearClasses[0]?.id ?? null
                            : null;
                        patch(row.studentId, {
                          decision: next,
                          targetClassId,
                          reason: next === "promote" || next === "graduate" ? "" : row.reason,
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue>
                          {(value: PromotionDecisionKind) =>
                            options.find((o) => o.value === value)?.label ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {row.decision === "promote" && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                        Target class ({nextAcademicYear})
                      </label>
                      <Select
                        value={row.targetClassId ?? ""}
                        disabled={readonly || nextYearClasses.length === 0}
                        onValueChange={(v) => patch(row.studentId, { targetClassId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a class…">
                            {(value: string) =>
                              nextYearClasses.find((c) => c.id === value)?.name ?? ""
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {nextYearClasses.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(row.decision === "repeat" || row.decision === "withdraw") && (
                    <div>
                      <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
                        Reason ({row.decision})
                      </label>
                      <Textarea
                        rows={2}
                        value={row.reason}
                        disabled={readonly}
                        placeholder={
                          row.decision === "repeat"
                            ? "Why is this student repeating?"
                            : "Why is this student withdrawing?"
                        }
                        onChange={(e) => patch(row.studentId, { reason: e.target.value })}
                      />
                    </div>
                  )}

                  {row.decision === "graduate" && (
                    <p className="text-xs text-muted-foreground self-center">
                      Student will complete basic school. No next-year enrollment.
                    </p>
                  )}
                </div>

                {!overrideMode && row.failedCoreSubjects != null && row.failedCoreSubjects > 0 && (
                  <Alert className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20">
                    <AlertDescription className="text-xs">
                      Failed {row.failedCoreSubjects} core subject
                      {row.failedCoreSubjects === 1 ? "" : "s"} on the Term-3 exam.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!readonly && (
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
            Save draft
          </Button>
          <Button onClick={() => setConfirmOpen(true)} disabled={isPending}>
            <Send size={14} className="mr-1.5" />
            Submit to Deputy Head
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit promotion list?</AlertDialogTitle>
            <AlertDialogDescription>
              The Deputy Head will review your decisions and either approve or send the list back
              with a comment. You can still edit after a send-back.
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
