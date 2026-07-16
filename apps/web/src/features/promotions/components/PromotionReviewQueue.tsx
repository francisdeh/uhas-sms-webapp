"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
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
import { useBulkApprovePromotionSubmissions } from "@/features/promotions/hooks/use-promotions";
import { formatDate } from "@/lib/dates";
import {
  PROMOTION_SUBMISSION_STATUS,
  type PromotionSubmissionStatus,
} from "@/features/promotions/types";
import type { components } from "@/types/api";

type QueueRow = components["schemas"]["DeputyHeadQueueRow"];

function statusPill(status: PromotionSubmissionStatus) {
  switch (status) {
    case PROMOTION_SUBMISSION_STATUS.SUBMITTED:
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">
          Pending review
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.APPROVED:
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
          <Check size={10} className="mr-1" /> Approved
        </Badge>
      );
    case PROMOTION_SUBMISSION_STATUS.SENT_BACK:
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px]">
          Sent back
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-[10px]">
          Draft
        </Badge>
      );
  }
}

export function PromotionReviewQueue({ queue }: { queue: QueueRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const bulkApprove = useBulkApprovePromotionSubmissions();

  const submittedIds = queue
    .filter((row) => row.submission.status === PROMOTION_SUBMISSION_STATUS.SUBMITTED)
    .map((row) => row.submission.id);
  const allSelected = submittedIds.length > 0 && submittedIds.every((id) => selected.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(submittedIds) : new Set());
  }

  async function handleBulkApprove() {
    try {
      await bulkApprove.mutateAsync({ submissionIds: Array.from(selected) });
      setSelected(new Set());
      setConfirmOpen(false);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-2">
      {submittedIds.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) => toggleAll(checked === true)}
            />
            Select all pending ({submittedIds.length})
          </label>
          {selected.size > 0 && (
            <Button size="sm" variant="brand" onClick={() => setConfirmOpen(true)}>
              <Check size={13} className="mr-1.5" />
              Approve {selected.size} selected
            </Button>
          )}
        </div>
      )}

      <div className="space-y-1">
        {queue.map((row) => {
          const isSelectable = row.submission.status === PROMOTION_SUBMISSION_STATUS.SUBMITTED;
          return (
            <div
              key={row.submission.id}
              className="flex items-center gap-2 rounded-md hover:bg-muted/50 transition-colors group"
            >
              {isSelectable && (
                <Checkbox
                  className="ml-2"
                  checked={selected.has(row.submission.id)}
                  onCheckedChange={(checked) =>
                    toggleOne(row.submission.id, checked === true)
                  }
                />
              )}
              <Link
                href={`/deputy-head/promotions/${row.submission.id}`}
                className={`flex-1 min-w-0 flex items-center justify-between py-2.5 px-2 ${isSelectable ? "" : "ml-2"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{row.className}</p>
                    {statusPill(row.submission.status)}
                    {row.submission.submittedByName && (
                      <span className="text-xs text-muted-foreground">
                        by {row.submission.submittedByName}
                      </span>
                    )}
                    {row.submission.submittedAt && (
                      <span className="text-xs text-muted-foreground">
                        · {formatDate(row.submission.submittedAt)}
                      </span>
                    )}
                  </div>
                  {row.classTeacherNames.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Class teacher{row.classTeacherNames.length === 1 ? "" : "s"}:{" "}
                      {row.classTeacherNames.join(", ")}
                    </p>
                  )}
                </div>
                <ChevronRight
                  size={14}
                  className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                />
              </Link>
            </div>
          );
        })}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve {selected.size} promotion lists?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates next-year enrollments for every student across all selected classes.
              The action cannot be undone — use class transfer or deactivate to fix individual
              mistakes afterwards. If one submission can&apos;t be approved, the rest still go
              through.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkApprove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkApprove} disabled={bulkApprove.isPending}>
              {bulkApprove.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
