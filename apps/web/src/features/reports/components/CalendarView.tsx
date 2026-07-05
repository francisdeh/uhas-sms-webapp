"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { formatDateWithWeekday as formatDate } from "@/lib/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/features/reports/hooks/use-calendar";
import type { CalendarEvent, CalendarEventType } from "@/features/reports/types";

const TYPE_LABELS: Record<CalendarEventType, string> = {
  term_start: "Term Start",
  term_end: "Term End",
  exam: "Exam",
  holiday: "Holiday",
  event: "Event",
};

const TYPE_COLORS: Record<CalendarEventType, string> = {
  term_start: "bg-blue-100 text-blue-700",
  term_end: "bg-blue-100 text-blue-700",
  exam: "bg-red-100 text-red-700",
  holiday: "bg-amber-100 text-amber-700",
  event: "bg-purple-100 text-purple-700",
};

function formatRange(start: string, end: string | null): string {
  if (!end) return formatDate(start);
  return `${formatDate(start)} → ${formatDate(end)}`;
}

const schema = z.object({
  title: z.string().min(3, { message: "Title required" }),
  description: z.string().optional(),
  startDate: z.string().min(1, { message: "Start date required" }),
  endDate: z.string().optional(),
  type: z.enum(["term_start", "term_end", "exam", "holiday", "event"]),
});

type FormValues = z.infer<typeof schema>;

interface CalendarViewProps {
  events: CalendarEvent[];
  authorId?: string;
  canManage?: boolean;
}

export function CalendarView({ events, authorId, canManage }: CalendarViewProps) {
  const router = useRouter();
  const createMut = useCreateCalendarEvent();
  const deleteMut = useDeleteCalendarEvent();
  const isPending = createMut.isPending || deleteMut.isPending;
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);
  // Author identity is derived from the JWT server-side now.
  void authorId;
  void toast;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: "event", title: "", description: "", startDate: "", endDate: "" },
  });

  async function onCreate(data: FormValues) {
    try {
      await createMut.mutateAsync({
        title: data.title,
        description: data.description || null,
        startDate: data.startDate,
        endDate: data.endDate || null,
        type: data.type,
      });
      setCreateOpen(false);
      form.reset({ type: "event", title: "", description: "", startDate: "", endDate: "" });
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => (e.endDate ?? e.startDate) >= today);
  const past = events.filter((e) => (e.endDate ?? e.startDate) < today);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Academic Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Term boundaries, exams, holidays, and key school events.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1.5" /> Add event
          </Button>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <CalendarIcon className="mx-auto mb-3 text-muted-foreground" size={28} />
              <p className="text-sm text-muted-foreground">No upcoming events.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map((e) => (
              <Card key={e.id}>
                <CardContent className="py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{e.title}</p>
                      <Badge className={"text-[10px] " + TYPE_COLORS[e.type]}>
                        {TYPE_LABELS[e.type]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <CalendarIcon size={11} className="inline mr-1" /> {formatRange(e.startDate, e.endDate)}
                    </p>
                    {e.description && (
                      <p className="text-sm text-muted-foreground mt-1.5">{e.description}</p>
                    )}
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                      onClick={() => setDeleteTarget(e)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Past ({past.length})</h2>
          <div className="space-y-2">
            {past.map((e) => (
              <Card key={e.id} className="opacity-70">
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{e.title}</p>
                      <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[e.type]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRange(e.startDate, e.endDate)}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                      onClick={() => setDeleteTarget(e)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add calendar event</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input id="title" {...form.register("title")} />
                <FieldError errors={[form.formState.errors.title]} />
              </Field>

              <Field>
                <FieldLabel>Type</FieldLabel>
                <Controller
                  name="type"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue>
                          {(value: CalendarEventType) => TYPE_LABELS[value]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TYPE_LABELS) as [CalendarEventType, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="startDate">Start date</FieldLabel>
                  <Input id="startDate" type="date" {...form.register("startDate")} />
                  <FieldError errors={[form.formState.errors.startDate]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="endDate">End date (optional)</FieldLabel>
                  <Input id="endDate" type="date" {...form.register("endDate")} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
                <Textarea id="description" rows={3} {...form.register("description")} />
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will be removed from everyone&apos;s academic calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
