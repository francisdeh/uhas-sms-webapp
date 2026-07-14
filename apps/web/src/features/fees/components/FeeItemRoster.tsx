"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Users, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCedis } from "@/lib/currency";
import {
  useAssignFeeItem,
  useFeeItemRoster,
  useUpdateFeeItem,
} from "@/features/fees/hooks/use-fees";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import { ApiError } from "@/lib/api/browser";
import type { FeeItem, LearnerFee } from "@/features/fees/types";
import { LearnerFeesTable } from "./LearnerFeesTable";

const editSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }).max(255),
  amount: z
    .string()
    .min(1, { message: "Amount is required" })
    .refine((v) => Number(v) > 0, { message: "Amount must be greater than 0" }),
  isActive: z.boolean(),
});

type EditFormValues = z.infer<typeof editSchema>;

interface FeeItemRosterProps {
  feeItem: FeeItem;
  initialRoster: LearnerFee[];
}

export function FeeItemRoster({ feeItem, initialRoster }: FeeItemRosterProps) {
  useBreadcrumbLabel(feeItem.id, feeItem.name);
  const router = useRouter();

  const { data: roster, isLoading } = useFeeItemRoster(feeItem.id, {
    initialData: initialRoster,
  });
  const assign = useAssignFeeItem();
  const updateFeeItem = useUpdateFeeItem();
  const [editOpen, setEditOpen] = useState(false);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: feeItem.name,
      amount: (feeItem.amountMinor / 100).toString(),
      isActive: feeItem.isActive,
    },
  });

  async function onEditSubmit(data: EditFormValues) {
    try {
      await updateFeeItem.mutateAsync({
        id: feeItem.id,
        payload: {
          name: data.name,
          amountMinor: Math.round(Number(data.amount) * 100),
          isActive: data.isActive,
        },
      });
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update fee item.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{feeItem.name}</h1>
            <Badge variant="secondary">{feeItem.scopeDisplay}</Badge>
            {!feeItem.isActive && <Badge variant="outline">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCedis(feeItem.amountMinor)} ·{" "}
            {feeItem.term ? `Term ${feeItem.term}, ${feeItem.academicYear}` : `${feeItem.academicYear} (Annual)`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => {
              editForm.reset({
                name: feeItem.name,
                amount: (feeItem.amountMinor / 100).toString(),
                isActive: feeItem.isActive,
              });
              setEditOpen(true);
            }}
          >
            <Pencil size={14} className="mr-1.5" /> Edit
          </Button>
          <Button onClick={() => assign.mutate(feeItem.id)} disabled={assign.isPending}>
            {assign.isPending ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Users size={14} className="mr-1.5" />
            )}
            Assign to roster
          </Button>
        </div>
      </div>

      {(roster ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="No learners assigned yet"
          description="Assign this fee item to its scope's roster to create one balance per learner."
          action={
            <Button size="sm" onClick={() => assign.mutate(feeItem.id)} disabled={assign.isPending}>
              <Users size={13} className="mr-1.5" /> Assign to roster
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CardTitle className="text-sm font-semibold">Assigned Roster</CardTitle>
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 font-medium">
              {(roster ?? []).length}
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            <LearnerFeesTable data={roster ?? []} isLoading={isLoading} bare />
          </CardContent>
        </Card>
      )}

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit fee item</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="edit-fee-name">Name</FieldLabel>
              <Input id="edit-fee-name" {...editForm.register("name")} />
              <FieldError errors={[editForm.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-fee-amount">Amount (GH₵)</FieldLabel>
              <Input
                id="edit-fee-amount"
                type="number"
                step="0.01"
                min="0"
                {...editForm.register("amount")}
              />
              <FieldError errors={[editForm.formState.errors.amount]} />
            </Field>

            <FieldGroup className="flex-row items-center justify-between gap-3">
              <Label htmlFor="edit-fee-active">Active</Label>
              <Controller
                name="isActive"
                control={editForm.control}
                render={({ field }) => (
                  <Switch
                    id="edit-fee-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </FieldGroup>

            <DialogFooter>
              <Button type="submit" variant="brand" disabled={updateFeeItem.isPending}>
                {updateFeeItem.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
