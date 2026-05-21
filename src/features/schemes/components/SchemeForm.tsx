"use client";

import { useState, useTransition } from "react";
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
  createSchemeAction,
  updateSchemeAction,
  submitSchemeAction,
  deleteSchemeAction,
} from "@/features/schemes/actions";
import type { Scheme } from "@/features/schemes/types";
import { SchemeStatusPill } from "./SchemeStatusPill";

const schema = z
  .object({
    type: z.enum(["work", "learning"], { message: "Select a type" }),
    classId: z.string().min(1, { message: "Select a class" }),
    subjectId: z.string().min(1, { message: "Select a subject" }),
    term: z.number().int().min(1).max(3),
    title: z.string().min(3, { message: "Add a title" }),
    fileUrl: z.string().optional(),
    content: z.string().optional(),
  })
  .refine((data) => Boolean(data.fileUrl) || Boolean(data.content && data.content.trim().length > 0), {
    message: "Provide either an upload URL or structured content",
    path: ["content"],
  });

type FormValues = z.infer<typeof schema>;

interface SchemeFormProps {
  teacherId: string;
  existing: Scheme | null;
  assignments: { classId: string; className: string; subjectId: string; subjectName: string }[];
  backHref: string;
}

export function SchemeForm({ teacherId, existing, assignments, backHref }: SchemeFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tempId] = useState(() => existing?.id ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const locked = existing?.status === "acknowledged";

  const uniqueClasses = Array.from(
    new Map(assignments.map((a) => [a.classId, a.className])).entries()
  ).map(([classId, className]) => ({ classId, className }));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: existing?.type ?? "work",
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

  function onSave(values: FormValues) {
    startTransition(async () => {
      const cleaned = { ...values, fileUrl: values.fileUrl || undefined, content: values.content || undefined };
      if (existing) {
        const result = await updateSchemeAction({ id: existing.id, teacherId, data: cleaned });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Saved.");
        router.refresh();
      } else {
        const result = await createSchemeAction({ teacherId, data: cleaned });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Scheme created.");
        router.push(backHref);
      }
    });
  }

  function onSubmitForReview() {
    if (!existing) {
      toast.error("Save the scheme first.");
      return;
    }
    startTransition(async () => {
      const result = await submitSchemeAction({ id: existing.id, teacherId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Submitted to Head of School.");
      router.refresh();
    });
  }

  function onDelete() {
    if (!existing) return;
    startTransition(async () => {
      const result = await deleteSchemeAction({ id: existing.id, teacherId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Scheme deleted.");
      router.push(backHref);
    });
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

      {existing?.reviewerComment && (
        <Alert>
          <AlertDescription>
            <strong>Head of School ({existing.reviewedByName}):</strong> {existing.reviewerComment}
          </AlertDescription>
        </Alert>
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
                        disabled={locked}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="work">Scheme of Work</SelectItem>
                          <SelectItem value="learning">Scheme of Learning</SelectItem>
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
                    <Pencil size={13} className="mr-1.5" /> Write from system
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="cursor-pointer px-4">
                    <FileText size={13} className="mr-1.5" /> Upload URL
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="structured">
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
              {existing && existing.status !== "acknowledged" && (
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
                {existing && existing.status === "draft" && (
                  <Button type="button" onClick={onSubmitForReview} disabled={isPending}>
                    <Send size={14} className="mr-1.5" /> Submit to Head of School
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
