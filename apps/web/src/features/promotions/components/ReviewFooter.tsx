"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Check, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  useApprovePromotionSubmission,
  useSendBackPromotionSubmission,
} from "@/features/promotions/hooks/use-promotions";

type Props = {
  submissionId: string;
  reviewedById: string;
  redirectTo: string;
};

export function ReviewFooter({ submissionId, reviewedById, redirectTo }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const approveMut = useApprovePromotionSubmission();
  const sendBackMut = useSendBackPromotionSubmission();
  const isPending = approveMut.isPending || sendBackMut.isPending;
  // Reviewer identity is derived from the JWT server-side now.
  void reviewedById;

  async function handleSendBack() {
    if (!comment.trim()) {
      toast.error("Add a comment explaining what to revise.");
      return;
    }
    try {
      await sendBackMut.mutateAsync({ id: submissionId, payload: { comment } });
      router.push(redirectTo);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function handleApprove() {
    try {
      await approveMut.mutateAsync(submissionId);
      setApproveOpen(false);
      router.push(redirectTo);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1 block">
            Reviewer comment (required for send back)
          </label>
          <Textarea
            rows={3}
            value={comment}
            placeholder="What needs revising before this can be approved?"
            onChange={(e) => setComment(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={handleSendBack} disabled={isPending}>
            {isPending ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Undo2 size={14} className="mr-1.5" />
            )}
            Send back
          </Button>
          <Button variant="brand" onClick={() => setApproveOpen(true)} disabled={isPending}>
            <Check size={14} className="mr-1.5" />
            Approve
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve promotion list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create next-year enrollments for every student in this list. The action
              cannot be undone — use class transfer or deactivate to fix individual mistakes
              afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
