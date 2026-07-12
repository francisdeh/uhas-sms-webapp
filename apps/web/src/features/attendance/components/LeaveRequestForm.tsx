"use client";

import { useState } from "react";
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
import { LeaveDocumentFiles } from "@/features/attendance/components/LeaveDocumentFiles";
import { LEAVE_TYPES } from "@/features/attendance/types";

const schema = z
  .object({
    type: z.enum(LEAVE_TYPES, { message: "Select a leave type" }),
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
  /** Owns any uploaded documents; the API derives the requester from
   *  the JWT for the request itself. */
  staffId?: string;
  staffName?: string;
}

const LEAVE_TYPE_LABELS: Record<(typeof LEAVE_TYPES)[number], string> = {
  Casual: "Casual Leave",
  Sick: "Sick Leave",
  Maternity: "Maternity Leave",
  Paternity: "Paternity Leave",
  Study: "Study Leave",
  Compassionate: "Compassionate Leave",
  Other: "Other",
};

export function LeaveRequestForm({ staffId, staffName }: LeaveRequestFormProps) {
  const create = useCreateLeaveRequest();
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  void staffName;

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

  async function onSubmit(values: FormValues) {
    await create.mutateAsync({
      type: values.type,
      startDate: values.startDate,
      endDate: values.endDate,
      reason: values.reason || null,
      documentUrls,
    });
    reset();
    setDocumentUrls([]);
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
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {LEAVE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
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

          {staffId && (
            <LeaveDocumentFiles
              ownerId={staffId}
              value={documentUrls}
              onChange={setDocumentUrls}
            />
          )}

          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Leave Request
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
