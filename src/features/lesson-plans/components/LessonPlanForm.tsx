"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Send, Trash2 } from "lucide-react";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import {
  createLessonPlanAction,
  updateLessonPlanAction,
  submitLessonPlanAction,
  deleteLessonPlanAction,
} from "@/features/lesson-plans/actions";
import type { LessonPlan } from "@/features/lesson-plans/types";
import { StatusPill } from "./StatusPill";

const schema = z.object({
  subjectId: z.string().min(1, { message: "Select a subject" }),
  classId: z.string().min(1, { message: "Select a class" }),
  term: z.number().int().min(1).max(3),
  week: z.number().int().min(1).max(20),
  topic: z.string().min(2, { message: "Add a topic" }),
  learningObjectives: z.string().min(5, { message: "Add learning objectives" }),
  teachingMethods: z.string().optional(),
  resources: z.string().optional(),
  assessmentPlan: z.string().optional(),
  fileUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface LessonPlanFormProps {
  teacherId: string;
  existing: LessonPlan | null;
  assignments: { classId: string; className: string; subjectId: string; subjectName: string }[];
  backHref: string;
}

export function LessonPlanForm({ teacherId, existing, assignments, backHref }: LessonPlanFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tempId] = useState(() => existing?.id ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const locked = existing?.status === "approved" || existing?.status === "unit_head_approved";

  const uniqueClasses = Array.from(
    new Map(assignments.map((a) => [a.classId, a.className])).entries()
  ).map(([classId, className]) => ({ classId, className }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      subjectId: existing?.subjectId ?? "",
      classId: existing?.classId ?? "",
      term: existing?.term ?? 1,
      week: existing?.week ?? 1,
      topic: existing?.topic ?? "",
      learningObjectives: existing?.learningObjectives ?? "",
      teachingMethods: existing?.teachingMethods ?? "",
      resources: existing?.resources ?? "",
      assessmentPlan: existing?.assessmentPlan ?? "",
      fileUrl: existing?.fileUrl ?? "",
    },
  });

  const selectedClassId = useWatch({ control: form.control, name: "classId" });
  const subjectsForSelectedClass = assignments.filter((a) => a.classId === selectedClassId);

  function onSave(values: FormValues) {
    startTransition(async () => {
      const cleaned = { ...values, fileUrl: values.fileUrl || undefined };
      if (existing) {
        const result = await updateLessonPlanAction({
          id: existing.id,
          teacherId,
          data: cleaned,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Saved.");
        router.refresh();
      } else {
        const result = await createLessonPlanAction({
          teacherId,
          data: cleaned,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Lesson plan created.");
        router.push(backHref);
      }
    });
  }

  function onSubmitForReview() {
    if (!existing) {
      toast.error("Save the plan first.");
      return;
    }
    startTransition(async () => {
      const result = await submitLessonPlanAction({ id: existing.id, teacherId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Submitted for review.");
      router.refresh();
    });
  }

  function onDelete() {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteLessonPlanAction({ id: existing.id, teacherId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Lesson plan deleted.");
      router.push(backHref);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {existing ? "Lesson plan" : "New lesson plan"}
          </h1>
          {existing && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {existing.className} · {existing.subjectName} · Term {existing.term} · Week {existing.week}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {existing && <StatusPill status={existing.status} />}
        </div>
      </div>

      {existing?.status === "rejected" && existing.reviewerComment && (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <AlertDescription>
            <strong>Rejected by {existing.reviewedByName}:</strong> {existing.reviewerComment}
            <br />
            Edit and re-submit when ready.
          </AlertDescription>
        </Alert>
      )}

      {existing && existing.reviewerComment && existing.status !== "rejected" && (
        <Alert>
          <AlertDescription>
            <strong>Reviewer note ({existing.reviewedByName}):</strong> {existing.reviewerComment}
          </AlertDescription>
        </Alert>
      )}

      {locked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription>This plan is approved and locked from edits.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={form.handleSubmit(onSave)}>
            <FieldGroup className="gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Class</FieldLabel>
                  <Controller
                    name="classId"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) {
                            field.onChange(v);
                            // Reset subject when class changes
                            form.setValue("subjectId", "");
                          }
                        }}
                        disabled={locked}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {uniqueClasses.length === 0 ? (
                            <SelectItem value="_none" disabled>
                              No classes assigned
                            </SelectItem>
                          ) : (
                            uniqueClasses.map((c) => (
                              <SelectItem key={c.classId} value={c.classId}>
                                {c.className}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.classId]} />
                </Field>

                <Field>
                  <FieldLabel>Subject</FieldLabel>
                  <Controller
                    name="subjectId"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => { if (v) field.onChange(v); }}
                        disabled={locked || !selectedClassId}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {subjectsForSelectedClass.length === 0 ? (
                            <SelectItem value="_none" disabled>
                              Pick a class first
                            </SelectItem>
                          ) : (
                            subjectsForSelectedClass.map((s) => (
                              <SelectItem key={s.subjectId} value={s.subjectId}>
                                {s.subjectName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[form.formState.errors.subjectId]} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Term</FieldLabel>
                  <Controller
                    name="term"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => { if (v) field.onChange(Number(v)); }}
                        disabled={locked}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Term 1</SelectItem>
                          <SelectItem value="2">Term 2</SelectItem>
                          <SelectItem value="3">Term 3</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="week">Week</FieldLabel>
                  <Input
                    id="week"
                    type="number"
                    min={1}
                    max={20}
                    {...form.register("week", { valueAsNumber: true })}
                    disabled={locked}
                  />
                  <FieldError errors={[form.formState.errors.week]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="topic">Topic</FieldLabel>
                <Input id="topic" disabled={locked} {...form.register("topic")} />
                <FieldError errors={[form.formState.errors.topic]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="learningObjectives">Learning objectives</FieldLabel>
                <Textarea
                  id="learningObjectives"
                  rows={3}
                  disabled={locked}
                  {...form.register("learningObjectives")}
                />
                <FieldError errors={[form.formState.errors.learningObjectives]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="teachingMethods">Teaching methods</FieldLabel>
                <Textarea
                  id="teachingMethods"
                  rows={2}
                  disabled={locked}
                  {...form.register("teachingMethods")}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="resources">Resources</FieldLabel>
                <Textarea id="resources" rows={2} disabled={locked} {...form.register("resources")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="assessmentPlan">Assessment plan</FieldLabel>
                <Textarea
                  id="assessmentPlan"
                  rows={2}
                  disabled={locked}
                  {...form.register("assessmentPlan")}
                />
              </Field>

              <Controller
                name="fileUrl"
                control={form.control}
                render={({ field }) => (
                  <FileUploadField
                    ownerId={tempId}
                    kind="lesson-plans/file"
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                    disabled={locked}
                    label="Attachment (optional)"
                  />
                )}
              />
            </FieldGroup>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {existing && (existing.status === "draft" || existing.status === "rejected") && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                  disabled={isPending}
                >
                  <Trash2 size={13} className="mr-1.5" /> Delete
                </Button>
              )}
              <div className="flex items-center gap-2 sm:ml-auto">
                {!locked && (
                  <Button type="submit" variant="outline" disabled={isPending}>
                    {isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
                    Save draft
                  </Button>
                )}
                {existing && (existing.status === "draft" || existing.status === "rejected") && (
                  <Button type="button" onClick={onSubmitForReview} disabled={isPending}>
                    <Send size={14} className="mr-1.5" /> Submit for review
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lesson plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={onDelete}
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
