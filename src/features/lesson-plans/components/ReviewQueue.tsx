"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, X, FileText, Inbox, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  unitHeadReviewAction,
  deputyHeadReviewAction,
} from "@/features/lesson-plans/actions";
import type { LessonPlan } from "@/features/lesson-plans/types";
import { StatusPill } from "./StatusPill";

interface ReviewQueueProps {
  reviewerId: string;
  reviewerRole: "UnitHead" | "DeputyHead";
  pending: LessonPlan[];
  recent: LessonPlan[];
}

export function ReviewQueue({ reviewerId, reviewerRole, pending, recent }: ReviewQueueProps) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejectTarget, setRejectTarget] = useState<LessonPlan | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reviewerFn(input: { id: string; reviewerId: string; decision: { decision: "approve" | "reject"; comment?: string } }) {
    return reviewerRole === "UnitHead"
      ? unitHeadReviewAction(input)
      : deputyHeadReviewAction(input);
  }

  function handleApprove(plan: LessonPlan) {
    setActingId(plan.id);
    startTransition(async () => {
      const result = await reviewerFn({
        id: plan.id,
        reviewerId,
        decision: { decision: "approve", comment: comments[plan.id] },
      });
      setActingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Approved.");
      router.refresh();
    });
  }

  function handleReject() {
    if (!rejectTarget) return;
    if (!comments[rejectTarget.id]?.trim()) {
      toast.error("Add a reason for rejection.");
      return;
    }
    setActingId(rejectTarget.id);
    startTransition(async () => {
      const result = await reviewerFn({
        id: rejectTarget.id,
        reviewerId,
        decision: { decision: "reject", comment: comments[rejectTarget.id] },
      });
      setActingId(null);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Rejected.");
      setRejectTarget(null);
      router.refresh();
    });
  }

  function toggle(id: string) {
    setOpenId(openId === id ? null : id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          {reviewerRole === "UnitHead" ? "Unit Head Reviews" : "Lesson Plan Approvals"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {reviewerRole === "UnitHead"
            ? "Plans submitted by teachers in your unit awaiting your review."
            : "Plans approved by Unit Heads awaiting your final sign-off."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Inbox}
            title="No plans pending your review"
            description={
              reviewerRole === "UnitHead"
                ? "New submissions from teachers in your unit will appear here."
                : "Plans that Unit Heads have approved will appear here for your sign-off."
            }
          />
        ) : (
          pending.map((plan) => {
            const isOpen = openId === plan.id;
            return (
              <Card key={plan.id}>
                <CardContent className="py-4">
                  <button
                    type="button"
                    onClick={() => toggle(plan.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{plan.topic ?? "(no topic)"}</p>
                        <StatusPill status={plan.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {plan.teacherName} · {plan.className} · {plan.subjectName} · Term {plan.term} · Week {plan.week}
                      </p>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-border/60 pt-3">
                      <DetailRow label="Learning objectives" value={plan.learningObjectives} />
                      <DetailRow label="Teaching methods" value={plan.teachingMethods} />
                      <DetailRow label="Resources" value={plan.resources} />
                      <DetailRow label="Assessment plan" value={plan.assessmentPlan} />
                      {plan.fileUrl && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Attachment</p>
                          <a
                            href={plan.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-blue-600 hover:underline"
                          >
                            <FileText size={13} className="mr-1.5" /> View attachment
                          </a>
                        </div>
                      )}
                      {plan.reviewerComment && (
                        <Alert>
                          <AlertDescription>
                            <strong>Previous note ({plan.reviewedByName}):</strong> {plan.reviewerComment}
                          </AlertDescription>
                        </Alert>
                      )}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Your comment (optional for approve, required for reject)
                        </p>
                        <Textarea
                          rows={2}
                          placeholder="Add a comment for the teacher…"
                          value={comments[plan.id] ?? ""}
                          onChange={(e) =>
                            setComments((prev) => ({ ...prev, [plan.id]: e.target.value }))
                          }
                          className="resize-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setRejectTarget(plan)}
                          disabled={isPending}
                        >
                          <X size={13} className="mr-1.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(plan)}
                          disabled={isPending && actingId === plan.id}
                        >
                          {isPending && actingId === plan.id ? (
                            <Loader2 size={13} className="animate-spin mr-1.5" />
                          ) : (
                            <Check size={13} className="mr-1.5" />
                          )}
                          Approve
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Recently reviewed ({recent.length})</h2>
        {recent.length === 0 ? (
          <EmptyState
            size="compact"
            icon={History}
            title="No recent decisions"
            description="Your approvals and rejections will show up here."
          />
        ) : (
          recent.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{plan.topic ?? "(no topic)"}</p>
                    <StatusPill status={plan.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan.teacherName} · {plan.className} · {plan.subjectName} · Term {plan.term} · Week {plan.week}
                  </p>
                </div>
                {plan.reviewedByName && (
                  <Badge variant="secondary" className="text-[10px]">
                    by {plan.reviewedByName}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject &quot;{rejectTarget?.topic}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              The teacher will see your comment and can revise + resubmit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleReject}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}
