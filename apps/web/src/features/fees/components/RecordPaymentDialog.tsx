"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRecordPayment } from "@/features/fees/hooks/use-fees";
import { CASH, PAYMENT_METHOD_LABELS, type LearnerFee, type PaymentMethod } from "@/features/fees/types";
import { formatCedis } from "@/lib/currency";
import { PaymentReceiptFiles } from "./PaymentReceiptFiles";

const formSchema = z.object({
  amount: z
    .string()
    .min(1, { message: "Amount is required" })
    .refine((v) => Number(v) > 0, { message: "Amount must be greater than 0" }),
  method: z.enum(["cash", "momo", "bank", "cheque"] as const),
  reference: z.string().optional(),
  receiptFileUrls: z.array(z.string()),
});

type FormValues = z.infer<typeof formSchema>;

interface RecordPaymentDialogProps {
  learnerFee: LearnerFee | null;
  onOpenChange: (open: boolean) => void;
}

export function RecordPaymentDialog({ learnerFee, onOpenChange }: RecordPaymentDialogProps) {
  const record = useRecordPayment();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { amount: "", method: CASH, reference: "", receiptFileUrls: [] },
  });

  useEffect(() => {
    if (learnerFee) {
      reset({
        amount: (learnerFee.balanceMinor / 100).toFixed(2),
        method: CASH,
        reference: "",
        receiptFileUrls: [],
      });
    }
  }, [learnerFee, reset]);

  async function onSubmit(values: FormValues) {
    if (!learnerFee) return;
    try {
      await record.mutateAsync({
        id: learnerFee.id,
        payload: {
          amountMinor: Math.round(Number(values.amount) * 100),
          method: values.method,
          reference: values.reference || undefined,
          receiptFileUrls: values.receiptFileUrls,
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
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        {learnerFee && (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {learnerFee.studentFirstName} {learnerFee.studentLastName} · {learnerFee.feeItemName}
              {" · "}Balance: {formatCedis(learnerFee.balanceMinor)}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (GH₵)</Label>
              <Input id="amount" type="number" step="0.01" min="0" {...register("amount")} />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Method</Label>
              <Controller
                name="method"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: PaymentMethod) => PAYMENT_METHOD_LABELS[value]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input
                id="reference"
                placeholder="e.g. MoMo transaction ID"
                {...register("reference")}
              />
            </div>

            <Controller
              name="receiptFileUrls"
              control={control}
              render={({ field }) => (
                <PaymentReceiptFiles
                  ownerId={learnerFee.studentId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={record.isPending}>
                {record.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Record payment
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
