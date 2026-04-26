"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { BookOpen, BookMarked, Sparkles, Loader2 } from "lucide-react";
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
import { createSubjectAction } from "@/features/classes/actions";
import type { Division, Subject } from "@/features/classes/types";
import { cn } from "@/lib/utils";

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  Primary: "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-[#F97316]",
};

const CATEGORY_PILL: Record<"Core" | "Elective", string> = {
  Core: "bg-blue-100 text-blue-700",
  Elective: "bg-orange-100 text-[#F97316]",
};

type DivisionFilter = Division | "All" | "Cross";

const createSchema = z.object({
  name: z.string().min(2, { message: "Min 2 characters" }),
  division: z.string().min(1, { message: "Select a division" }),
  category: z.enum(["Core", "Elective"], { message: "Select a category" }),
});

type CreateFormValues = z.infer<typeof createSchema>;

interface SubjectsTableProps {
  initialSubjects: Subject[];
}

export default function SubjectsTable({ initialSubjects }: SubjectsTableProps) {
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects);
  const [createOpen, setCreateOpen] = useState(false);
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("All");
  const [isPending, startTransition] = useTransition();

  const totalCount = subjects.length;
  const coreCount = subjects.filter((s) => s.category === "Core").length;
  const electiveCount = subjects.filter((s) => s.category === "Elective").length;

  const displayedSubjects = subjects.filter((s) => {
    if (divisionFilter === "All") return true;
    if (divisionFilter === "Cross") return s.division === null;
    return s.division === divisionFilter;
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", division: "", category: undefined },
  });

  function closeDialog() {
    setCreateOpen(false);
    reset();
  }

  function onSubmit(values: CreateFormValues) {
    const division: Division | null =
      values.division === "all" ? null : (values.division as Division);

    startTransition(async () => {
      const result = await createSubjectAction({
        name: values.name,
        division,
        category: values.category,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const newSubject: Subject = {
        id: result.id,
        schoolId: "",
        name: values.name,
        division,
        category: values.category,
      };

      setSubjects((prev) => [...prev, newSubject]);
      toast.success("Subject added.");
      closeDialog();
    });
  }

  const columns: ColumnDef<Subject>[] = [
    {
      id: "subject",
      header: "Subject",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="text-sm font-medium">{row.original.name}</span>
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
              DIVISION_PILL[div]
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
        const cat = row.original.category;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              CATEGORY_PILL[cat]
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Subjects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage subjects across all divisions.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCreateOpen(true)}>
          Add Subject
        </Button>
      </div>

      {/* Stats */}
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

      {/* Table card */}
      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {/* Division filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["All", "KG", "Primary", "JHS", "Cross"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDivisionFilter(d)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                divisionFilter === d
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
              )}
            >
              {d === "All" ? "All" : d === "Cross" ? "Cross-division" : d}
            </button>
          ))}
        </div>

        <DataTable
          columns={columns}
          data={displayedSubjects}
          searchKey="subject"
          searchPlaceholder="Search subjects…"
        />
      </div>

      {/* Create Subject Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-4">
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
                        <SelectItem value="Primary">Primary</SelectItem>
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
                      value={field.value}
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
                disabled={isPending || isSubmitting}
                variant="default"
              >
                {(isPending || isSubmitting) && (
                  <Loader2 size={15} className="animate-spin mr-2" />
                )}
                {isPending || isSubmitting ? "Adding…" : "Add Subject"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
