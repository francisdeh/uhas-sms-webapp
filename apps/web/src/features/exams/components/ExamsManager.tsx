"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, Lock, Unlock, ClipboardCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  useCreateExam,
  usePublishExam,
  useUnpublishExam,
} from "@/features/exams/hooks/use-exams";
import type { Exam } from "@/features/exams/types";

const createSchema = z.object({
  name: z.string().min(2, { message: "Name required" }),
  type: z.enum(["MidTerm", "EndOfTerm"], { message: "Select a type" }),
  term: z.number().int().min(1).max(3),
  academicYear: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, { message: "Format must be YYYY/YYYY (e.g. 2025/2026)" }),
});

type CreateFormValues = z.infer<typeof createSchema>;

export function ExamsManager({
  initialExams,
  currentYear,
}: {
  initialExams: Exam[];
  currentYear: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [publishTarget, setPublishTarget] = useState<Exam | null>(null);
  const [unpublishTarget, setUnpublishTarget] = useState<Exam | null>(null);

  const createExam = useCreateExam();
  const publishExam = usePublishExam();
  const unpublishExam = useUnpublishExam();
  const isPending =
    createExam.isPending || publishExam.isPending || unpublishExam.isPending;

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { term: 1, academicYear: currentYear },
  });

  async function onCreate(data: CreateFormValues) {
    try {
      await createExam.mutateAsync(data);
      setCreateOpen(false);
      form.reset({ term: 1, academicYear: currentYear });
    } catch {
      /* toast already fired inside the hook */
    }
  }

  async function handlePublish() {
    if (!publishTarget) return;
    try {
      await publishExam.mutateAsync(publishTarget.id);
      setPublishTarget(null);
    } catch {
      /* toast already fired */
    }
  }

  async function handleUnpublish() {
    if (!unpublishTarget) return;
    try {
      await unpublishExam.mutateAsync(unpublishTarget.id);
      setUnpublishTarget(null);
    } catch {
      /* toast already fired */
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Examinations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure mid-term and end-of-term exams. Publish to lock scores and release report cards.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> New exam
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Term</TableHead>
                <TableHead>Academic Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialExams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No exams configured yet. Click &quot;New exam&quot; to create one.
                  </TableCell>
                </TableRow>
              )}
              {initialExams.map((exam) => (
                <TableRow key={exam.id}>
                  <TableCell className="font-medium text-sm">{exam.name}</TableCell>
                  <TableCell className="text-sm">
                    {exam.type === "MidTerm" ? "Mid-Term" : "End of Term"}
                  </TableCell>
                  <TableCell className="text-sm">Term {exam.term}</TableCell>
                  <TableCell className="text-sm">{exam.academicYear}</TableCell>
                  <TableCell>
                    {exam.isPublished ? (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                        <Lock size={11} className="mr-1" /> Published
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/examinations/${exam.id}/review`}>
                        <Button variant="outline" size="sm">
                          <ClipboardCheck size={12} className="mr-1.5" /> Review
                        </Button>
                      </Link>
                      {exam.isPublished ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setUnpublishTarget(exam)}
                          disabled={isPending}
                        >
                          <Unlock size={12} className="mr-1.5" /> Unpublish
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => setPublishTarget(exam)}
                          disabled={isPending}
                        >
                          <Lock size={12} className="mr-1.5" /> Publish
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New examination</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="exam-name">Name</FieldLabel>
                <Input
                  id="exam-name"
                  placeholder="e.g. Mid-Term 1"
                  {...form.register("name")}
                />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel>Type</FieldLabel>
                <Controller
                  name="type"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MidTerm">Mid-Term (raw 100)</SelectItem>
                        <SelectItem value="EndOfTerm">End of Term (composite)</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[form.formState.errors.type]} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel>Term</FieldLabel>
                  <Controller
                    name="term"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        value={String(field.value)}
                        onValueChange={(v) => { if (v) field.onChange(Number(v)); }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Term" />
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
                  <FieldLabel htmlFor="academic-year">Academic Year</FieldLabel>
                  <Input
                    id="academic-year"
                    placeholder="2025/2026"
                    {...form.register("academicYear")}
                  />
                  <FieldError errors={[form.formState.errors.academicYear]} />
                </Field>
              </div>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Publish confirm */}
      <AlertDialog open={!!publishTarget} onOpenChange={(open) => { if (!open) setPublishTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {publishTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing locks all scores for this exam and makes report cards visible to parents.
              You can unpublish later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unpublish confirm */}
      <AlertDialog open={!!unpublishTarget} onOpenChange={(open) => { if (!open) setUnpublishTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish {unpublishTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Teachers will be able to edit scores again and parents will no longer see the report cards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleUnpublish}
              disabled={isPending}
            >
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
