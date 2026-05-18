"use client";

import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { createClassAction } from "@/features/classes/actions";
import type { Division, SchoolClass } from "@/features/classes/types";

const CLASS_NAMES = [
  { name: "KG 1", division: "KG" as Division },
  { name: "KG 2", division: "KG" as Division },
  { name: "Primary 1", division: "Lower Primary" as Division },
  { name: "Primary 2", division: "Lower Primary" as Division },
  { name: "Primary 3", division: "Lower Primary" as Division },
  { name: "Primary 4", division: "Upper Primary" as Division },
  { name: "Primary 5", division: "Upper Primary" as Division },
  { name: "Primary 6", division: "Upper Primary" as Division },
  { name: "JHS 1A", division: "JHS" as Division },
  { name: "JHS 2A", division: "JHS" as Division },
  { name: "JHS 3A", division: "JHS" as Division },
];

const schema = z.object({
  name: z.string().min(1, { message: "Select a class" }),
  academicYear: z
    .string()
    .regex(/^\d{4}\/\d{4}$/, { message: "Format must be YYYY/YYYY (e.g. 2025/2026)" }),
});

type FormValues = z.infer<typeof schema>;

interface ClassCreateFormProps {
  existingClasses: SchoolClass[];
  listHref: string;
  currentYear: string;
}

export default function ClassCreateForm({
  existingClasses,
  listHref,
  currentYear,
}: ClassCreateFormProps) {
  const router = useRouter();

  const {
    register,
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
    const isDuplicate = existingClasses.some(
      (c) => c.name === values.name && c.academicYear === values.academicYear
    );
    if (isDuplicate) {
      toast.error("This class already exists for the selected academic year.");
      return;
    }

    const entry = CLASS_NAMES.find((c) => c.name === values.name)!;
    const result = await createClassAction({
      name: values.name,
      division: entry.division,
      academicYear: values.academicYear,
    });

    if (result.success) {
      toast.success("Class created.");
      router.push(listHref);
    } else {
      toast.error(result.error);
    }
  }

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
                <FieldLabel htmlFor="academicYear">Academic Year</FieldLabel>
                <Input
                  id="academicYear"
                  type="text"
                  placeholder="e.g. 2025/2026"
                  {...register("academicYear")}
                />
                <FieldError errors={[errors.academicYear]} />
              </Field>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
                >
                  {isSubmitting && (
                    <Loader2 size={15} className="animate-spin mr-2" />
                  )}
                  {isSubmitting ? "Adding…" : "Add Class"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => router.back()}
                >
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
