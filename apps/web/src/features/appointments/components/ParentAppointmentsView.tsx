"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Calendar, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import {
  useCancelAppointment,
  useCreateAppointment,
} from "@/features/appointments/hooks/use-appointments";
import type { Appointment } from "@/features/appointments/types";
import { SLOT_LABELS } from "@/features/appointments/types";
import { AppointmentStatusPill } from "./AppointmentStatusPill";
import { formatDateWithWeekday as formatDate } from "@/lib/dates";

const schema = z.object({
  studentId: z.string().min(1, { message: "Pick a child" }),
  teacherId: z.string().min(1, { message: "Pick a teacher" }),
  preferredDate: z.string().min(1, { message: "Pick a date" }),
  preferredSlot: z.enum(["snack", "lunch", "after_school"]),
  reason: z.string().min(5, { message: "Add a short reason" }),
});

type FormValues = z.infer<typeof schema>;

interface ChildOption {
  id: string;
  name: string;
  className: string;
  teachers: { id: string; name: string; subjects: string[] }[];
}

interface ParentAppointmentsViewProps {
  guardianId: string;
  childOptions: ChildOption[];
  appointments: Appointment[];
}

export function ParentAppointmentsView({
  guardianId,
  childOptions,
  appointments,
}: ParentAppointmentsViewProps) {
  const router = useRouter();
  const createMut = useCreateAppointment();
  const cancelMut = useCancelAppointment();
  const isPending = createMut.isPending || cancelMut.isPending;
  const [createOpen, setCreateOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  // Guardian id comes from the JWT server-side now.
  void guardianId;
  void toast;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      preferredSlot: "snack",
      studentId: childOptions[0]?.id ?? "",
      teacherId: "",
      preferredDate: "",
      reason: "",
    },
  });

  const selectedStudentId = useWatch({ control: form.control, name: "studentId" });
  const teachersForChild = childOptions.find((c) => c.id === selectedStudentId)?.teachers ?? [];

  async function onCreate(data: FormValues) {
    try {
      await createMut.mutateAsync({
        studentId: data.studentId,
        teacherId: data.teacherId,
        preferredDate: data.preferredDate,
        preferredSlot: data.preferredSlot,
        reason: data.reason,
      });
      setCreateOpen(false);
      form.reset({
        preferredSlot: "snack",
        studentId: childOptions[0]?.id ?? "",
        teacherId: "",
        preferredDate: "",
        reason: "",
      });
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await cancelMut.mutateAsync(cancelTarget.id);
      setCancelTarget(null);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Appointments</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Book a time to meet your child&apos;s teachers about their progress.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={childOptions.length === 0}>
          <Plus size={14} className="mr-1.5" /> Book appointment
        </Button>
      </div>

      {childOptions.length === 0 && (
        <Alert>
          <AlertDescription>No children are linked to your account.</AlertDescription>
        </Alert>
      )}

      {appointments.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No appointment requests yet"
          description="Book a meeting with your child's teacher to discuss progress, attendance, or any concerns."
          action={
            childOptions.length > 0 ? (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} className="mr-1.5" /> Book appointment
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          {appointments.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">
                      Meeting with {a.teacherName} re: {a.studentName}
                    </p>
                    <AppointmentStatusPill status={a.status} />
                  </div>
                  {a.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setCancelTarget(a)}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X size={13} />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  <Calendar size={11} className="inline mr-1" />
                  {formatDate(a.preferredDate)} · {SLOT_LABELS[a.preferredSlot]}
                </p>
                {a.reason && <p className="text-sm whitespace-pre-wrap">{a.reason}</p>}
                {a.teacherResponse && (
                  <Alert className="mt-2">
                    <AlertDescription>
                      <strong>Teacher response:</strong> {a.teacherResponse}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book appointment</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel>Child</FieldLabel>
                <Controller
                  name="studentId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) {
                          field.onChange(v);
                          form.setValue("teacherId", "");
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a child">
                          {(value: string) => {
                            const c = childOptions.find((c) => c.id === value);
                            return c ? `${c.name} — ${c.className}` : "";
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {childOptions.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} — {c.className}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.studentId]} />
              </Field>

              <Field>
                <FieldLabel>Teacher</FieldLabel>
                <Controller
                  name="teacherId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                      disabled={!selectedStudentId || teachersForChild.length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={
                            teachersForChild.length === 0
                              ? "No teachers found for this child"
                              : "Select a teacher"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {teachersForChild.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.subjects.join(", ")})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.teacherId]} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="preferredDate">Preferred date</FieldLabel>
                  <Input
                    id="preferredDate"
                    type="date"
                    {...form.register("preferredDate")}
                  />
                  <FieldError errors={[form.formState.errors.preferredDate]} />
                </Field>

                <Field>
                  <FieldLabel>Time slot</FieldLabel>
                  <Controller
                    name="preferredSlot"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => { if (v) field.onChange(v); }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(value: keyof typeof SLOT_LABELS) => SLOT_LABELS[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="snack">{SLOT_LABELS.snack}</SelectItem>
                          <SelectItem value="lunch">{SLOT_LABELS.lunch}</SelectItem>
                          <SelectItem value="after_school">{SLOT_LABELS.after_school}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="reason">Reason for the meeting</FieldLabel>
                <Textarea
                  id="reason"
                  rows={3}
                  placeholder="e.g. Discuss my child's recent math results."
                  {...form.register("reason")}
                />
                <FieldError errors={[form.formState.errors.reason]} />
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Send request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment request?</AlertDialogTitle>
            <AlertDialogDescription>
              The teacher will see this as cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Cancel request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
