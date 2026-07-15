"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save, Send, Trash2, FileText, Pencil } from "lucide-react";
import { FileUploadField } from "@/features/uploads/components/FileUploadField";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  useCreateScheme,
  useDeleteScheme,
  useSubmitScheme,
  useUpdateScheme,
} from "@/features/schemes/hooks/use-schemes";
import { WORK, LEARNING, SCHEME_TYPES, SCHEME_STATUS, SCHEME_TYPE_LABELS, type Scheme } from "@/features/schemes/types";
import { TERMS } from "@/features/exams/types";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import { SchemeStatusPill } from "./SchemeStatusPill";
import { SchemeCommentThread } from "./SchemeCommentThread";
import { SchemeWeeklyEntries } from "./SchemeWeeklyEntries";

const schema = z
  .object({
    type: z.enum(SCHEME_TYPES, { message: "Select a type" }),
    classId: z.string().min(1, { message: "Select a class" }),
    subjectId: z.string().min(1, { message: "Select a subject" }),
    term: z.number().int().min(1).max(3),
    title: z.string().min(3, { message: "Add a title" }),
    fileUrl: z.string().optional(),
    content: z.string().optional(),
  })
  .refine(
    (data) =>
      // A Scheme of Learning's content is its weekly entries (added once
      // the scheme exists) or an upload — never the free-text `content`
      // field, so this create-time check only applies to Scheme of Work.
      data.type === LEARNING ||
      Boolean(data.fileUrl) ||
      Boolean(data.content && data.content.trim().length > 0),
    {
      message: "Provide either an upload URL or structured content",
      path: ["content"],
    },
  );

type FormValues = z.infer<typeof schema>;

interface SchemeFormProps {
  teacherId: string;
  existing: Scheme | null;
  assignments: { classId: string; className: string; subjectId: string; subjectName: string }[];
  backHref: string;
  /** The school's currently-active academic year, passed by the Server Component
   * that renders this form — the FastAPI create endpoint requires it. */
  currentAcademicYear: string;
}

export function SchemeForm({
  teacherId,
  existing,
  assignments,
  backHref,
  currentAcademicYear,
}: SchemeFormProps) {
  useBreadcrumbLabel(existing?.id, existing?.title);

  const router = useRouter();
  const createScheme = useCreateScheme();
  const updateScheme = useUpdateScheme();
  const submitScheme = useSubmitScheme();
  const deleteScheme = useDeleteScheme();
  const isPending =
    createScheme.isPending ||
    updateScheme.isPending ||
    submitScheme.isPending ||
    deleteScheme.isPending;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tempId] = useState(() => existing?.id ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  // Teacher identity is now derived from the JWT server-side.
  void teacherId;

  const locked = existing?.status === SCHEME_STATUS.ACKNOWLEDGED;

  const uniqueClasses = Array.from(
    new Map(assignments.map((a) => [a.classId, a.className])).entries()
  ).map(([classId, className]) => ({ classId, className }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: existing?.type ?? WORK,
      classId: existing?.classId ?? "",
      subjectId: existing?.subjectId ?? "",
      term: existing?.term ?? 1,
      title: existing?.title ?? "",
      fileUrl: existing?.fileUrl ?? "",
      content: existing?.content ?? "",
    },
  });

  const selectedClassId = useWatch({ control: form.control, name: "classId" });
  const subjectsForClass = assignments.filter((a) => a.classId === selectedClassId);
  const selectedType = useWatch({ control: form.control, name: "type" });
  const isLearning = selectedType === LEARNING;
  const canEditEntries = existing?.status === SCHEME_STATUS.DRAFT;

  async function onSave(values: FormValues) {
    const cleaned = {
      ...values,
      fileUrl: values.fileUrl || null,
      content: values.content || null,
    };
    try {
      if (existing) {
        await updateScheme.mutateAsync({
          id: existing.id,
          payload: {
            title: cleaned.title,
            fileUrl: cleaned.fileUrl,
            content: cleaned.content,
          },
        });
      } else {
        await createScheme.mutateAsync({
          subjectId: cleaned.subjectId,
          classId: cleaned.classId,
          type: cleaned.type,
          term: cleaned.term,
          academicYear: currentAcademicYear,
          title: cleaned.title,
          fileUrl: cleaned.fileUrl,
          content: cleaned.content,
        });
        router.push(backHref);
      }
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onSubmitForReview() {
    if (!existing) {
      toast.error("Save the scheme first.");
      return;
    }
    try {
      await submitScheme.mutateAsync(existing.id);
    } catch {
      /* toast fired inside the hook */
    }
  }

  async function onDelete() {
    if (!existing) return;
    try {
      await deleteScheme.mutateAsync(existing.id);
      router.push(backHref);
    } catch {
      /* toast fired inside the hook */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{existing ? "Scheme" : "New scheme"}</h1>
          {existing && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {existing.title}
            </p>
          )}
        </div>
        {existing && <SchemeStatusPill status={existing.status} />}
      </div>

      {existing && existing.status !== SCHEME_STATUS.DRAFT && (
        <Card>
          <CardContent className="py-4">
            <SchemeCommentThread
              schemeId={existing.id}
              comments={existing.comments}
              currentStaffId={existing.teacherId}
              canComment
            />
          </CardContent>
        </Card>
      )}

      {locked && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertDescription>This scheme has been acknowledged and is locked.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={form.handleSubmit(onSave)}>
            <FieldGroup className="gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <Controller
                    name="type"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => { if (v) field.onChange(v); }}
                        // Type is immutable once created (the update
                        // endpoint doesn't accept it) — lock it as soon
                        // as the scheme exists, not just once acknowledged.
                        disabled={locked || !!existing}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(value: keyof typeof SCHEME_TYPE_LABELS) => SCHEME_TYPE_LABELS[value]}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={WORK}>{SCHEME_TYPE_LABELS[WORK]}</SelectItem>
                          <SelectItem value={LEARNING}>{SCHEME_TYPE_LABELS[LEARNING]}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>

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
                          <SelectValue>{(value: string) => `Term ${value}`}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {TERMS.map((t) => (
                            <SelectItem key={t} value={String(t)}>
                              Term {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>

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
                        disabled={locked}
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
                        disabled={locked || !selectedClassId}
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
                <Input
                  id="title"
                  placeholder="e.g. JHS 1 — English Scheme of Work, Term 1"
                  disabled={locked}
                  {...form.register("title")}
                />
                <FieldError errors={[form.formState.errors.title]} />
              </Field>

              <Tabs defaultValue={existing?.fileUrl ? "upload" : "structured"} className="flex flex-col gap-3">
                <TabsList variant="line" className="w-full justify-start gap-0">
                  <TabsTrigger value="structured" className="cursor-pointer px-4">
                    <Pencil size={13} className="mr-1.5" />
                    {isLearning ? "Weekly entries" : "Write from system"}
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="cursor-pointer px-4">
                    <FileText size={13} className="mr-1.5" /> Upload URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="structured">
                  {isLearning ? (
                    existing ? (
                      <SchemeWeeklyEntries
                        schemeId={existing.id}
                        entries={existing.entries}
                        canEdit={canEditEntries}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Save this scheme as a draft first, then add each week&apos;s Strand,
                        Sub-strand, Content Standard, Indicators, and Resources.
                      </p>
                    )
                  ) : (
                    <Field>
                      <FieldLabel htmlFor="content">Content (one row per week recommended)</FieldLabel>
                      <Textarea
                        id="content"
                        rows={10}
                        placeholder={"Week 1: …\nWeek 2: …\n…"}
                        disabled={locked}
                        {...form.register("content")}
                      />
                      <FieldError errors={[form.formState.errors.content]} />
                    </Field>
                  )}
                </TabsContent>

                <TabsContent value="upload">
                  <Controller
                    name="fileUrl"
                    control={form.control}
                    render={({ field }) => (
                      <FileUploadField
                        ownerId={tempId}
                        kind="schemes/file"
                        value={field.value ?? null}
                        onChange={(v) => field.onChange(v ?? "")}
                        disabled={locked}
                        label="Scheme document"
                      />
                    )}
                  />
                </TabsContent>
              </Tabs>
            </FieldGroup>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {existing && existing.status !== SCHEME_STATUS.ACKNOWLEDGED && (
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
                {existing && existing.status === SCHEME_STATUS.DRAFT && (
                  <Button type="button" variant="brand" onClick={onSubmitForReview} disabled={isPending}>
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
            <AlertDialogTitle>Delete this scheme?</AlertDialogTitle>
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
