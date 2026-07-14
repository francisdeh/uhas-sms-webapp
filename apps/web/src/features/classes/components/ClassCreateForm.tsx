"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { useCreateClass } from "@/features/classes/hooks/use-classes";
import { ApiError } from "@/lib/api/browser";
import type { Division } from "@/features/classes/types";
import type { AcademicYear } from "@/lib/academic-year";

const CLASS_NAMES: Array<{ name: string; division: Division; slug: string }> = [
  { name: "KG 1", division: "KG", slug: "class-kg1" },
  { name: "KG 2", division: "KG", slug: "class-kg2" },
  { name: "Primary 1", division: "Lower Primary", slug: "class-p1" },
  { name: "Primary 2", division: "Lower Primary", slug: "class-p2" },
  { name: "Primary 3", division: "Lower Primary", slug: "class-p3" },
  { name: "Primary 4", division: "Upper Primary", slug: "class-p4" },
  { name: "Primary 5", division: "Upper Primary", slug: "class-p5" },
  { name: "Primary 6", division: "Upper Primary", slug: "class-p6" },
  { name: "JHS 1", division: "JHS", slug: "class-jhs1" },
  { name: "JHS 2", division: "JHS", slug: "class-jhs2" },
  { name: "JHS 3", division: "JHS", slug: "class-jhs3" },
];

const schema = z.object({
  name: z.string().min(1, { message: "Select a class" }),
  academicYear: z.string().min(1, { message: "Select an academic year" }),
});

type FormValues = z.infer<typeof schema>;

interface ClassCreateFormProps {
  listHref: string;
  /** Current-year default for the form; comes from the school config. */
  currentYear: AcademicYear;
  /** Selectable years — every year with school_terms data, plus the
   *  school's real current + next year (see getAcademicYearOptions). */
  yearOptions: AcademicYear[];
}

/**
 * The `slug` is derived from the selected class name + academic year
 * (see [seed-data/classes.ts](../../../scripts/_seed-data/classes.ts)
 * for the convention — `class-jhs1` for the base year, `class-jhs1-2027`
 * for later years). Users don't type it directly; keeps the surface
 * simple and matches the DB's per-school uniqueness constraint.
 */
function computeSlug(baseSlug: string, academicYear: string, defaultYear: string): string {
  if (academicYear === defaultYear) return baseSlug;
  const [, endYear] = academicYear.split("/");
  return endYear ? `${baseSlug}-${endYear}` : baseSlug;
}

export default function ClassCreateForm({
  listHref,
  currentYear,
  yearOptions,
}: ClassCreateFormProps) {
  const router = useRouter();
  const createClass = useCreateClass();

  const {
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", academicYear: currentYear },
  });

  const selectedName = useWatch({ control, name: "name" });
  const selectedEntry = CLASS_NAMES.find((c) => c.name === selectedName);

  async function onSubmit(values: FormValues) {
    const entry = CLASS_NAMES.find((c) => c.name === values.name);
    if (!entry) return;

    try {
      await createClass.mutateAsync({
        slug: computeSlug(entry.slug, values.academicYear, currentYear),
        name: values.name,
        division: entry.division,
        academicYear: values.academicYear,
      });
      toast.success("Class created.");
      router.push(listHref);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create class.");
    }
  }

  const isPending = createClass.isPending || isSubmitting;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Add Class</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create a new class for an academic year.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Class Details</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel>Class Name</FieldLabel>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) field.onChange(v);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_NAMES.map((entry) => (
                          <SelectItem key={entry.name} value={entry.name}>
                            {entry.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {selectedEntry && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Division: {selectedEntry.division}
                  </p>
                )}
                <FieldError errors={[errors.name]} />
              </Field>

              <Field>
                <FieldLabel>Academic Year</FieldLabel>
                <Controller
                  name="academicYear"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) field.onChange(v);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an academic year" />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((year) => (
                          <SelectItem key={year} value={year}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.academicYear]} />
              </Field>

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" variant="brand" disabled={isPending}>
                  {isPending && <Loader2 size={15} className="animate-spin mr-2" />}
                  {isPending ? "Adding…" : "Add Class"}
                </Button>

                <Button type="button" variant="ghost" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
