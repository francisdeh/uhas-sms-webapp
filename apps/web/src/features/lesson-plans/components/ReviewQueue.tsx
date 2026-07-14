"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, X, Inbox, History } from "lucide-react";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
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
import { useReviewLessonPlan } from "@/features/lesson-plans/hooks/use-lesson-plans";
import {
  LESSON_PLAN_REVIEWER_ROLE,
  LESSON_PLAN_STATUS,
  type LessonPlan,
  type LessonPlanReviewerRole,
  type LessonPlanStatus,
} from "@/features/lesson-plans/types";
import { StatusPill } from "./StatusPill";

interface ReviewQueueProps {
  reviewerId: string;
  reviewerRole: LessonPlanReviewerRole;
  pending: LessonPlan[];
  recent: LessonPlan[];
}

export function ReviewQueue({ reviewerId, reviewerRole, pending, recent }: ReviewQueueProps) {
  const focusId = useSearchParams().get("focus");
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [rejectTarget, setRejectTarget] = useState<LessonPlan | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const review = useReviewLessonPlan();
  const isPending = review.isPending;
  // Reviewer identity is derived from the JWT server-side now; kept in
  // props for backward-compat with the Server Component that renders
  // this queue.
  void reviewerId;

  // A search hit for a lesson plan lands here with `?focus=<id>` — open
  // it (if it's in the pending queue). Adjusted during render (not an
  // effect) so clicking a new search result while this page is already
  // mounted still re-opens the newly-focused card, matching React's
  // getDerivedStateFromProps replacement: https://react.dev/learn/you-might-not-need-an-effect
  const [syncedFocusId, setSyncedFocusId] = useState<string | null>(null);
  if (focusId && focusId !== syncedFocusId) {
    setSyncedFocusId(focusId);
    setOpenId(focusId);
  }

  // Scrolling the DOM is a genuine side effect, so it stays in a
  // `useEffect` — only the `openId` derivation above moved to render time.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`lesson-plan-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  async function handleApprove(plan: LessonPlan) {
    setActingId(plan.id);
    // Unit Head advances "submitted → unit_head_approved"; Deputy Head
    // finalises "unit_head_approved → approved" (or "submitted →
    // approved" if they're skipping the Unit Head step). The service
    // infers which from the plan's current status + caller role.
    const decision: LessonPlanStatus =
      reviewerRole === LESSON_PLAN_REVIEWER_ROLE.UNIT_HEAD &&
      plan.status === LESSON_PLAN_STATUS.SUBMITTED
        ? LESSON_PLAN_STATUS.UNIT_HEAD_APPROVED
        : LESSON_PLAN_STATUS.APPROVED;
    try {
      await review.mutateAsync({
        id: plan.id,
        payload: {
          decision,
          comment: comments[plan.id] || null,
        },
      });
    } catch {
      /* toast fired inside the hook */
    }
    setActingId(null);
  }

  async function handleReject() {
    if (!rejectTarget) return;
    if (!comments[rejectTarget.id]?.trim()) {
      toast.error("Add a reason for rejection.");
      return;
    }
    setActingId(rejectTarget.id);
    try {
      await review.mutateAsync({
        id: rejectTarget.id,
        payload: {
          decision: LESSON_PLAN_STATUS.REJECTED,
          comment: comments[rejectTarget.id],
        },
      });
      setRejectTarget(null);
    } catch {
      /* toast fired inside the hook */
    }
    setActingId(null);
  }

  function toggle(id: string) {
    setOpenId(openId === id ? null : id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">
          {reviewerRole === LESSON_PLAN_REVIEWER_ROLE.UNIT_HEAD ? "Unit Head Reviews" : "Lesson Plan Approvals"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {reviewerRole === LESSON_PLAN_REVIEWER_ROLE.UNIT_HEAD
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
              reviewerRole === LESSON_PLAN_REVIEWER_ROLE.UNIT_HEAD
                ? "New submissions from teachers in your unit will appear here."
                : "Plans that Unit Heads have approved will appear here for your sign-off."
            }
          />
        ) : (
          pending.map((plan) => {
            const isOpen = openId === plan.id;
            return (
              <Card key={plan.id} id={`lesson-plan-${plan.id}`}>
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
                          <ClientDocumentDownloadLink
                            storagePath={plan.fileUrl}
                            label="View attachment"
                          />
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
            <Card key={plan.id} id={`lesson-plan-${plan.id}`}>
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
              variant="destructive-solid"
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
