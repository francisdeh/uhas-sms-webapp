"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateLearnerFee } from "@/features/fees/hooks/use-fees";
import type { LearnerFee } from "@/features/fees/types";

const formSchema = z.object({
  amount: z
    .string()
    .min(1, { message: "Amount is required" })
    .refine((v) => Number(v) > 0, { message: "Amount must be greater than 0" }),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditLearnerFeeDialogProps {
  learnerFee: LearnerFee | null;
  onOpenChange: (open: boolean) => void;
}

export function EditLearnerFeeDialog({ learnerFee, onOpenChange }: EditLearnerFeeDialogProps) {
  const update = useUpdateLearnerFee();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", dueDate: "" },
  });

  useEffect(() => {
    if (learnerFee) {
      reset({
        amount: (learnerFee.amountMinor / 100).toFixed(2),
        dueDate: learnerFee.dueDate ?? "",
      });
    }
  }, [learnerFee, reset]);

  async function onSubmit(values: FormValues) {
    if (!learnerFee) return;
    try {
      await update.mutateAsync({
        id: learnerFee.id,
        payload: {
          amountMinor: Math.round(Number(values.amount) * 100),
          dueDate: values.dueDate || undefined,
        },
      });
      onOpenChange(false);
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <Dialog open={Boolean(learnerFee)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit fee</DialogTitle>
        </DialogHeader>
        {learnerFee && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {learnerFee.studentFirstName} {learnerFee.studentLastName} · {learnerFee.feeItemName}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (GH₵)</Label>
              <Input id="amount" type="number" step="0.01" min="0" {...register("amount")} />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date (optional)</Label>
              <Input id="dueDate" type="date" {...register("dueDate")} />
            </div>

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={update.isPending}>
                {update.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
