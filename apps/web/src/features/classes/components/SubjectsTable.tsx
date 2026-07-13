"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BookOpen, BookMarked, Sparkles, Loader2, Plus } from "lucide-react";
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
import { useSubjects, useCreateSubject } from "@/features/subjects/hooks/use-subjects";
import { ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";
import type { Division } from "@/features/classes/types";
import { cn } from "@/lib/utils";

type SubjectRead = components["schemas"]["SubjectRead"];

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

const CATEGORY_PILL: Record<string, string> = {
  Core: "bg-blue-100 text-blue-700",
  Elective: "bg-orange-100 text-accent-orange",
  Optional: "bg-slate-100 text-slate-700",
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
  category: z.enum(["Core", "Elective"], { message: "Select a category" }),
});

type CreateFormValues = z.infer<typeof createSchema>;

export default function SubjectsTable() {
  const [createOpen, setCreateOpen] = useState(false);
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
  const coreCount = subjects.filter((s) => s.category === "Core").length;
  const electiveCount = subjects.filter((s) => s.category === "Elective").length;

  const createSubject = useCreateSubject();

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

  function closeDialog() {
    setCreateOpen(false);
    reset();
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
        const cat = row.original.category ?? "Core";
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
                        <SelectItem value="KG">KG</SelectItem>
                        <SelectItem value="Lower Primary">Lower Primary</SelectItem>
                        <SelectItem value="Upper Primary">Upper Primary</SelectItem>
                        <SelectItem value="JHS">JHS</SelectItem>
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
                        if (v) field.onChange(v as "Core" | "Elective");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Core">Core</SelectItem>
                        <SelectItem value="Elective">Elective</SelectItem>
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
    </div>
  );
}
