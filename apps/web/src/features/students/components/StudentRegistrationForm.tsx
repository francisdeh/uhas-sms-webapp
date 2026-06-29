"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { createStudentAction } from "@/features/students/actions";
import type { ClassRecord } from "@/features/students/types";

const schema = z.object({
  firstName: z.string().min(2, { message: "Must be at least 2 characters" }),
  lastName: z.string().min(2, { message: "Must be at least 2 characters" }),
  dob: z
    .string()
    .min(1, { message: "Date of birth is required" })
    .refine(
      (val) => {
        const date = new Date(val);
        const now = new Date();
        const age =
          (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return age >= 3 && age <= 20;
      },
      { message: "Student must be between 3 and 20 years old" }
    ),
  gender: z.enum(["Male", "Female"], { message: "Select a gender" }),
  classId: z.string().min(1, { message: "Select a class" }),
  phone: z.string().optional(),
  address: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  photoUrl: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface StudentRegistrationFormProps {
  division?: string;
  listHref: string;
  classes: ClassRecord[];
}

export default function StudentRegistrationForm({
  division,
  listHref,
  classes,
}: StudentRegistrationFormProps) {
  const router = useRouter();

  // Stable temp ownerId for the photo upload before the student is created.
  // The uploaded URL is stored as `photoUrl`; the path is just a bucket location.
  const [tempId] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const availableClasses = classes;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(values: FormValues) {
    const result = await createStudentAction(values);
    if (result.success) {
      toast.success(`Student registered — ID: ${result.id}`);
      router.push(listHref);
    } else {
      toast.error(result.error);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Register Student</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add a new student to the school records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Student Information</CardTitle>
          <CardDescription>
            Fill in the required details below. Optional fields can be completed
            later.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-5">
              {/* Full-width: First Name */}
              <Field>
                <FieldLabel htmlFor="firstName">First Name</FieldLabel>
                <Input
                  id="firstName"
                  placeholder="e.g. Abena"
                  {...register("firstName")}
                />
                <FieldError errors={[errors.firstName]} />
              </Field>

              {/* Full-width: Last Name */}
              <Field>
                <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
                <Input
                  id="lastName"
                  placeholder="e.g. Mensah"
                  {...register("lastName")}
                />
                <FieldError errors={[errors.lastName]} />
              </Field>

              {/* 2-col: Gender + Date of Birth */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Gender</FieldLabel>
                  <Controller
                    name="gender"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.gender]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="dob">Date of Birth</FieldLabel>
                  <Input id="dob" type="date" {...register("dob")} />
                  <FieldError errors={[errors.dob]} />
                </Field>
              </div>

              {/* Full-width: Class */}
              <Field>
                <FieldLabel>Class</FieldLabel>
                <Controller
                  name="classId"
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
                        {availableClasses.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.classId]} />
              </Field>

              {/* Photo upload */}
              <Controller
                name="photoUrl"
                control={control}
                render={({ field }) => (
                  <ImageUploadField
                    ownerId={tempId}
                    kind="students/photo"
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                  />
                )}
              />

              <Separator />

              {/* Optional Information */}
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground -mb-1">
                Optional Information
              </p>

              {/* Full-width: Phone */}
              <Field>
                <FieldLabel htmlFor="phone">Parent/Guardian Phone</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 0244 000 000"
                  {...register("phone")}
                />
                <FieldError errors={[errors.phone]} />
              </Field>

              {/* Full-width: Address */}
              <Field>
                <FieldLabel htmlFor="address">Home Address</FieldLabel>
                <Textarea
                  id="address"
                  placeholder="e.g. House No. 5, Legon Road, Accra"
                  rows={3}
                  {...register("address")}
                />
                <FieldError errors={[errors.address]} />
              </Field>

              {/* 2-col: Nationality + Religion */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="nationality">Nationality</FieldLabel>
                  <Input
                    id="nationality"
                    placeholder="e.g. Ghanaian"
                    {...register("nationality")}
                  />
                  <FieldError errors={[errors.nationality]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="religion">Religion</FieldLabel>
                  <Input
                    id="religion"
                    placeholder="e.g. Christian"
                    {...register("religion")}
                  />
                  <FieldError errors={[errors.religion]} />
                </Field>
              </div>

              {/* Footer actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-800 text-white hover:bg-slate-900 active:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {isSubmitting && (
                    <Loader2 size={15} className="animate-spin mr-2" />
                  )}
                  {isSubmitting ? "Registering…" : "Register Student"}
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
