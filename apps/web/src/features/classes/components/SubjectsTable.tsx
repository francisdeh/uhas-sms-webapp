"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BookOpen, BookMarked, Sparkles, Loader2, Plus, Pencil } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import {
  useSubjects,
  useCreateSubject,
  useUpdateSubject,
} from "@/features/subjects/hooks/use-subjects";
import { ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";
import {
  SUBJECT_CATEGORY,
  SUBJECT_CATEGORIES,
  type Division,
  type SubjectCategory,
} from "@/features/classes/types";
import { DIVISIONS } from "@/features/auth/types";
import { cn } from "@/lib/utils";

type SubjectRead = components["schemas"]["SubjectRead"];

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

const CATEGORY_PILL: Record<SubjectCategory, string> = {
  [SUBJECT_CATEGORY.CORE]: "bg-blue-100 text-blue-700",
  [SUBJECT_CATEGORY.ELECTIVE]: "bg-orange-100 text-accent-orange",
  [SUBJECT_CATEGORY.OPTIONAL]: "bg-slate-100 text-slate-700",
};

type DivisionFilter = Division | "All" | "Cross";

const createSchema = z.object({
  slug: z
    .string()
    .min(2, { message: "Min 2 characters" })
    .max(50, { message: "Max 50 characters" })
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "Letters, numbers, dashes and underscores only",
    }),
  name: z.string().min(2, { message: "Min 2 characters" }),
  division: z.string().min(1, { message: "Select a division" }),
  category: z.enum(SUBJECT_CATEGORIES, { message: "Select a category" }),
});

type CreateFormValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  name: z.string().min(2, { message: "Min 2 characters" }),
  division: z.string().min(1, { message: "Select a division" }),
  category: z.enum(SUBJECT_CATEGORIES, { message: "Select a category" }),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function SubjectsTable() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubjectRead | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("All");

  // Server-side filter — pass `division` to the API when the user picks
  // a specific division. "All" and "Cross" (null division) both fall
  // through and get filtered client-side below.
  const apiDivision =
    divisionFilter === "All" || divisionFilter === "Cross"
      ? undefined
      : divisionFilter;

  const { data, isLoading, error } = useSubjects({
    division: apiDivision,
    size: 100,
  });
  const subjects: SubjectRead[] = data?.items ?? [];

  const displayed = subjects.filter((s) => {
    if (divisionFilter === "Cross") return s.division == null;
    return true;
  });

  const totalCount = data?.total ?? 0;
  const coreCount = subjects.filter((s) => s.category === SUBJECT_CATEGORY.CORE).length;
  const electiveCount = subjects.filter((s) => s.category === SUBJECT_CATEGORY.ELECTIVE).length;

  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject(editTarget?.id ?? "");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { slug: "", name: "", division: "", category: undefined },
  });

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
  });

  function closeDialog() {
    setCreateOpen(false);
    reset();
  }

  function openEditDialog(subject: SubjectRead) {
    editForm.reset({
      name: subject.name,
      division: subject.division ?? "all",
      category: (subject.category ?? SUBJECT_CATEGORY.CORE) as EditFormValues["category"],
    });
    setEditTarget(subject);
  }

  async function onEditSubmit(values: EditFormValues) {
    if (!editTarget) return;
    const division: Division | null =
      values.division === "all" ? null : (values.division as Division);

    try {
      await updateSubject.mutateAsync({ name: values.name, division, category: values.category });
      toast.success("Subject updated.");
      setEditTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update subject.");
    }
  }

  async function onSubmit(values: CreateFormValues) {
    const division: Division | null =
      values.division === "all" ? null : (values.division as Division);

    try {
      await createSubject.mutateAsync({
        slug: values.slug,
        name: values.name,
        division,
        category: values.category,
      });
      toast.success("Subject added.");
      closeDialog();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add subject.");
    }
  }

  const columns: ColumnDef<SubjectRead>[] = [
    {
      id: "subject",
      header: "Subject",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.original.name}</span>
          <span className="text-[11px] text-muted-foreground">{row.original.slug}</span>
        </div>
      ),
    },
    {
      accessorKey: "division",
      header: "Division",
      cell: ({ row }) => {
        const div = row.original.division;
        if (!div) {
          return (
            <span className="text-sm text-muted-foreground">All divisions</span>
          );
        }
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              DIVISION_PILL[div as Division],
            )}
          >
            {div}
          </span>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const cat = row.original.category ?? SUBJECT_CATEGORY.CORE;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              CATEGORY_PILL[cat],
            )}
          >
            {cat}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => openEditDialog(row.original)}
            title="Edit"
          >
            <Pencil size={13} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Subjects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage subjects across all divisions.
          </p>
        </div>
        <Button variant="brand" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Add Subject
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Subjects"
          value={totalCount}
          icon={<BookOpen size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Core"
          value={coreCount}
          icon={<BookMarked size={17} className="text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Elective"
          value={electiveCount}
          icon={<Sparkles size={17} className="text-orange-500" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
        />
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["All", "KG", "Lower Primary", "Upper Primary", "JHS", "Cross"] as const).map(
            (d) => (
              <button
                key={d}
                onClick={() => setDivisionFilter(d)}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                  divisionFilter === d
                    ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground",
                )}
              >
                {d === "All" ? "All" : d === "Cross" ? "Cross-division" : d}
              </button>
            ),
          )}
        </div>

        {error ? (
          <div className="text-sm text-destructive">{error.message}</div>
        ) : null}

        <DataTable
          columns={columns}
          data={isLoading ? [] : displayed}
          searchKey="subject"
          searchPlaceholder="Search subjects…"
        />
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="subjectSlug">Slug / Code</FieldLabel>
                <Input
                  id="subjectSlug"
                  type="text"
                  placeholder="e.g. MATH"
                  {...register("slug")}
                />
                <FieldError errors={[errors.slug]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="subjectName">Name</FieldLabel>
                <Input
                  id="subjectName"
                  type="text"
                  placeholder="e.g. Mathematics"
                  {...register("name")}
                />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field>
                <FieldLabel>Division</FieldLabel>
                <Controller
                  name="division"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) field.onChange(v);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a division" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIVISIONS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value="all">All divisions</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.division]} />
              </Field>

              <Field>
                <FieldLabel>Category</FieldLabel>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => {
                        if (v) field.onChange(v as CreateFormValues["category"]);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.category]} />
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button
                type="submit"
                disabled={createSubject.isPending || isSubmitting}
                variant="brand"
              >
                {(createSubject.isPending || isSubmitting) && (
                  <Loader2 size={15} className="animate-spin mr-2" />
                )}
                {createSubject.isPending || isSubmitting ? "Adding…" : "Add Subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subject</DialogTitle>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="editSubjectName">Name</FieldLabel>
                <Input id="editSubjectName" type="text" {...editForm.register("name")} />
                <FieldError errors={[editForm.formState.errors.name]} />
              </Field>

              <Field>
                <FieldLabel>Division</FieldLabel>
                <Controller
                  name="division"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a division" />
                      </SelectTrigger>
                      <SelectContent>
                        {DIVISIONS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                        <SelectItem value="all">All divisions</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[editForm.formState.errors.division]} />
              </Field>

              <Field>
                <FieldLabel>Category</FieldLabel>
                <Controller
                  name="category"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => {
                        if (v) field.onChange(v as EditFormValues["category"]);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECT_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[editForm.formState.errors.category]} />
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={updateSubject.isPending} variant="brand">
                {updateSubject.isPending && <Loader2 size={15} className="animate-spin mr-2" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
