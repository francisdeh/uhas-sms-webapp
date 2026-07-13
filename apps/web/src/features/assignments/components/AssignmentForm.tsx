"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Send, Trash2, Unlock } from "lucide-react";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  useCreateAssignment,
  useUpdateAssignment,
  usePublishAssignment,
  useUnpublishAssignment,
  useDeleteAssignment,
} from "@/features/assignments/hooks/use-assignments";
import { ASSIGNMENT_STATUS, type Assignment } from "@/features/assignments/types";

const schema = z.object({
  classId: z.string().min(1, { message: "Select a class" }),
  subjectId: z.string().min(1, { message: "Select a subject" }),
  title: z.string().min(3, { message: "Add a title" }),
  description: z.string().optional(),
  dueDate: z.string().min(1, { message: "Pick a due date" }),
  fileUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface AssignmentFormProps {
  teacherId: string;
  existing: Assignment | null;
  assignments: { classId: string; className: string; subjectId: string; subjectName: string }[];
  backHref: string;
}

export function AssignmentForm({ teacherId, existing, assignments, backHref }: AssignmentFormProps) {
  const router = useRouter();
  const createMut = useCreateAssignment();
  const updateMut = useUpdateAssignment();
  const publishMut = usePublishAssignment();
  const unpublishMut = useUnpublishAssignment();
  const deleteMut = useDeleteAssignment();
  const isPending =
    createMut.isPending ||
    updateMut.isPending ||
    publishMut.isPending ||
    unpublishMut.isPending ||
    deleteMut.isPending;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tempId] = useState(() => existing?.id ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  // Teacher identity is derived from the JWT server-side now; kept in
  // props so parent Server Components don't have to change yet.
  void teacherId;

  const published = existing?.status === ASSIGNMENT_STATUS.PUBLISHED;

  const uniqueClasses = Array.from(
    new Map(assignments.map((a) => [a.classId, a.className])).entries()
  ).map(([classId, className]) => ({ classId, className }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      classId: existing?.classId ?? "",
      subjectId: existing?.subjectId ?? "",
      title: existing?.title ?? "",
      description: existing?.description ?? "",
      dueDate: existing?.dueDate ?? "",
      fileUrl: existing?.fileUrl ?? "",
    },
  });

  const selectedClassId = useWatch({ control: form.control, name: "classId" });
  const subjectsForClass = assignments.filter((a) => a.classId === selectedClassId);

  async function onSave(values: FormValues) {
    const description = values.description || null;
    const fileUrl = values.fileUrl || null;
    try {
      if (existing) {
        await updateMut.mutateAsync({
          id: existing.id,
          payload: {
            classId: values.classId,
            subjectId: values.subjectId,
            title: values.title,
            description,
            fileUrl,
            dueDate: values.dueDate,
          },
        });
      } else {
        await createMut.mutateAsync({
          classId: values.classId,
          subjectId: values.subjectId,
          title: values.title,
          description,
          fileUrl,
          dueDate: values.dueDate,
        });
        router.push(backHref);
      }
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onPublish() {
    if (!existing) {
      toast.error("Save the assignment first.");
      return;
    }
    try {
      await publishMut.mutateAsync(existing.id);
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onUnpublish() {
    if (!existing) return;
    try {
      await unpublishMut.mutateAsync(existing.id);
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onDelete() {
    if (!existing) return;
    try {
      await deleteMut.mutateAsync(existing.id);
      router.push(backHref);
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {existing ? "Assignment" : "New assignment"}
          </h1>
          {existing && (
            <p className="text-sm text-muted-foreground mt-0.5">{existing.title}</p>
          )}
        </div>
        {existing && (
          published ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Published</Badge>
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )
        )}
      </div>

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
                            form.setValue("subjectId", "");
                          }
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select class">
                            {(value: string) =>
                              uniqueClasses.find((c) => c.classId === value)?.className ?? ""
                            }
                          </SelectValue>
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
                        disabled={!selectedClassId}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select subject">
                            {(value: string) =>
                              subjectsForClass.find((s) => s.subjectId === value)?.subjectName ?? ""
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {subjectsForClass.length === 0 ? (
                            <SelectItem value="_none" disabled>
                              Pick a class first
                            </SelectItem>
                          ) : (
                            subjectsForClass.map((s) => (
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

              <Field>
                <FieldLabel htmlFor="title">Title</FieldLabel>
                <Input id="title" {...form.register("title")} />
                <FieldError errors={[form.formState.errors.title]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="description">Description (optional)</FieldLabel>
                <Textarea id="description" rows={4} {...form.register("description")} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
                  <Input id="dueDate" type="date" {...form.register("dueDate")} />
                  <FieldError errors={[form.formState.errors.dueDate]} />
                </Field>

                <Controller
                  name="fileUrl"
                  control={form.control}
                  render={({ field }) => (
                    <FileUploadField
                      ownerId={tempId}
                      kind="assignments/file"
                      value={field.value ?? null}
                      onChange={(v) => field.onChange(v ?? "")}
                      label="Attachment (optional)"
                    />
                  )}
                />
              </div>
            </FieldGroup>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {existing && (
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
                <Button type="submit" variant="outline" disabled={isPending}>
                  {isPending ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Save size={14} className="mr-1.5" />}
                  Save
                </Button>
                {existing && !published && (
                  <Button type="button" variant="brand" onClick={onPublish} disabled={isPending}>
                    <Send size={14} className="mr-1.5" /> Publish to parents
                  </Button>
                )}
                {existing && published && (
                  <Button type="button" variant="outline" onClick={onUnpublish} disabled={isPending}>
                    <Unlock size={14} className="mr-1.5" /> Unpublish
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
            <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
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
