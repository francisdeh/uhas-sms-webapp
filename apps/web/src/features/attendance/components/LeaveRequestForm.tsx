"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

import { useCreateLeaveRequest } from "@/features/leave-requests/hooks/use-leave-requests";
import type { components } from "@/types/api";

// API leave-type union — inferred from the wire so we don't hardcode.
type ApiLeaveType = components["schemas"]["LeaveRequestCreate"]["type"];

const schema = z
  .object({
    type: z.enum(
      ["Sick", "Maternity", "Casual", "Paternity", "Study", "Compassionate", "Other"],
      { message: "Select a leave type" }
    ),
    startDate: z.string().min(1, { message: "Start date is required" }),
    endDate: z.string().min(1, { message: "End date is required" }),
    reason: z.string().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

type FormValues = z.infer<typeof schema>;

interface LeaveRequestFormProps {
  /** Kept for compatibility; the API now derives requester from the JWT. */
  staffId?: string;
  staffName?: string;
}

export function LeaveRequestForm({ staffId, staffName }: LeaveRequestFormProps) {
  const create = useCreateLeaveRequest();

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: undefined,
      startDate: "",
      endDate: "",
      reason: "",
    },
  });

  const leaveType = useWatch({ control, name: "type" });
  // The API derives the requester from the JWT; these props exist for
  // backwards compat with the current page renders.
  void staffId;
  void staffName;

  async function onSubmit(values: FormValues) {
    await create.mutateAsync({
      type: values.type as ApiLeaveType,
      startDate: values.startDate,
      endDate: values.endDate,
      reason: values.reason || null,
    });
    reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Submit Leave Request</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Leave Type</Label>
            <Select
              onValueChange={(v) =>
                setValue("type", v as FormValues["type"], { shouldValidate: true })
              }
              value={leaveType}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Sick">Sick Leave</SelectItem>
                <SelectItem value="Maternity">Maternity Leave</SelectItem>
                <SelectItem value="Paternity">Paternity Leave</SelectItem>
                <SelectItem value="Casual">Casual Leave</SelectItem>
                <SelectItem value="Study">Study Leave</SelectItem>
                <SelectItem value="Compassionate">Compassionate Leave</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-xs text-destructive">{errors.type.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <input
                type="date"
                {...register("startDate")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errors.startDate && (
                <p className="text-xs text-destructive">{errors.startDate.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <input
                type="date"
                {...register("endDate")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {errors.endDate && (
                <p className="text-xs text-destructive">{errors.endDate.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>
              Reason <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              placeholder="Brief reason for leave"
              {...register("reason")}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Leave Request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
