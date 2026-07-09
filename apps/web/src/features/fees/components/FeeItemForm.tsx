"use client";

import { useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Loader2 } from "lucide-react";
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
import { useCreateFeeItem } from "@/features/fees/hooks/use-fees";
import { CLASS_SCOPE, DIVISION_SCOPE, SCHOOL_SCOPE } from "@/features/fees/types";
import { ACADEMIC_YEARS, DEFAULT_ACADEMIC_YEAR } from "@/lib/academic-year";
import { DIVISIONS } from "@/features/auth/types";
import { useClasses } from "@/features/classes/hooks/use-classes";

const SCOPE_LABELS = {
  [SCHOOL_SCOPE]: "Whole school",
  [DIVISION_SCOPE]: "One division",
  [CLASS_SCOPE]: "One class",
};

const formSchema = z
  .object({
    name: z.string().min(1, { message: "Name is required" }).max(255),
    scope: z.enum(["school", "division", "class"] as const),
    scopeRef: z.string().optional(),
    academicYear: z.string().min(1, { message: "Academic year is required" }),
    term: z.string(), // "annual" = no term
    amount: z
      .string()
      .min(1, { message: "Amount is required" })
      .refine((v) => Number(v) > 0, { message: "Amount must be greater than 0" }),
  })
  .refine((data) => data.scope === SCHOOL_SCOPE || Boolean(data.scopeRef), {
    message: "Required for this scope",
    path: ["scopeRef"],
  });

type FormValues = z.infer<typeof formSchema>;

export function FeeItemForm() {
  const [open, setOpen] = useState(false);
  const create = useCreateFeeItem();
  const { data: classesResp } = useClasses({ size: 200 });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      scope: SCHOOL_SCOPE,
      scopeRef: "",
      academicYear: DEFAULT_ACADEMIC_YEAR,
      term: "annual",
      amount: "",
    },
  });

  const scope = useWatch({ control, name: "scope" });

  async function onSubmit(values: FormValues) {
    try {
      await create.mutateAsync({
        name: values.name,
        scope: values.scope,
        scopeRef: values.scope === SCHOOL_SCOPE ? undefined : values.scopeRef,
        academicYear: values.academicYear,
        term: values.term === "annual" ? undefined : Number(values.term),
        amountMinor: Math.round(Number(values.amount) * 100),
      });
      setOpen(false);
      reset();
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={14} className="mr-1.5" /> New fee item
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New fee item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="e.g. PTA Dues" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Applies to</Label>
            <Controller
              name="scope"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: keyof typeof SCOPE_LABELS) => SCOPE_LABELS[value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SCHOOL_SCOPE}>{SCOPE_LABELS[SCHOOL_SCOPE]}</SelectItem>
                    <SelectItem value={DIVISION_SCOPE}>{SCOPE_LABELS[DIVISION_SCOPE]}</SelectItem>
                    <SelectItem value={CLASS_SCOPE}>{SCOPE_LABELS[CLASS_SCOPE]}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {scope === DIVISION_SCOPE && (
            <div className="space-y-1.5">
              <Label>Division</Label>
              <Controller
                name="scopeRef"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a division" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIVISIONS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.scopeRef && (
                <p className="text-xs text-destructive">{errors.scopeRef.message}</p>
              )}
            </div>
          )}

          {scope === CLASS_SCOPE && (
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Controller
                name="scopeRef"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {(classesResp?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.scopeRef && (
                <p className="text-xs text-destructive">{errors.scopeRef.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Academic year</Label>
              <Controller
                name="academicYear"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACADEMIC_YEARS.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Controller
                name="term"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(value: string) => (value === "annual" ? "Annual" : `Term ${value}`)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="1">Term 1</SelectItem>
                      <SelectItem value="2">Term 2</SelectItem>
                      <SelectItem value="3">Term 3</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount (GH₵)</Label>
            <Input id="amount" type="number" step="0.01" min="0" {...register("amount")} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
    </>
  );
}
