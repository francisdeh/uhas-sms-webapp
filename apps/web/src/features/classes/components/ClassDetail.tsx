"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { DataTable } from "@/components/ui/data-table";
import {
  addClassSubjectAction,
  assignTeacherAction,
  assignClassTeacherAction,
} from "@/features/classes/actions";
import type { Division, SchoolClass, Subject, ClassSubject } from "@/features/classes/types";
import type { Student } from "@/features/students/types";
import type { Staff } from "@/features/staff/types";
import { cn } from "@/lib/utils";

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

const DIVISION_AVATAR: Record<Division, string> = {
  KG: "from-purple-400 to-purple-600",
  "Lower Primary": "from-sky-400 to-sky-600",
  "Upper Primary": "from-blue-400 to-blue-600",
  JHS: "from-orange-400 to-accent-orange",
};

const CATEGORY_PILL: Record<"Core" | "Elective", string> = {
  Core: "bg-blue-100 text-blue-700",
  Elective: "bg-orange-100 text-accent-orange",
};

const selectSchema = z.object({
  value: z.string().min(1, { message: "Select an option" }),
});

type SelectFormValues = z.infer<typeof selectSchema>;

interface ClassDetailProps {
  schoolClass: SchoolClass;
  classSubjects: ClassSubject[];
  roster: Student[];
  availableSubjects: Subject[];
  availableTeachers: Staff[];
  allSubjects?: Subject[];
}

export default function ClassDetail({
  schoolClass,
  classSubjects,
  roster,
  availableSubjects,
  availableTeachers,
  allSubjects = [],
}: ClassDetailProps) {
  const subjectCategoryMap = new Map<string, "Core" | "Elective">(
    allSubjects.map((s) => [s.id, s.category])
  );
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [teacherOpen, setTeacherOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ClassSubject | null>(null);

  const teacherForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: {
      value:
        (schoolClass.classTeachers.find((t) => t.isPrimary) ?? schoolClass.classTeachers[0])
          ?.staffId ?? "none",
    },
  });

  const subjectForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { value: "" },
  });

  const assignForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { value: assignTarget?.teacherId ?? "none" },
  });

  function onTeacherSubmit(data: SelectFormValues) {
    startTransition(async () => {
      const result = await assignClassTeacherAction(schoolClass.id, {
        teacherId: data.value === "none" ? null : data.value,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Class teacher updated.");
      setTeacherOpen(false);
      router.refresh();
    });
  }

  function onSubjectSubmit(data: SelectFormValues) {
    startTransition(async () => {
      const result = await addClassSubjectAction(schoolClass.id, {
        subjectId: data.value,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Subject added.");
      subjectForm.reset({ value: "" });
      setSubjectOpen(false);
      router.refresh();
    });
  }

  function onAssignSubmit(data: SelectFormValues) {
    if (!assignTarget) return;
    startTransition(async () => {
      const result = await assignTeacherAction(
        schoolClass.id,
        assignTarget.subjectId,
        { teacherId: data.value === "none" ? null : data.value }
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Teacher assigned.");
      setAssignTarget(null);
      router.refresh();
    });
  }

  function openAssignDialog(subject: ClassSubject) {
    assignForm.reset({ value: subject.teacherId ?? "none" });
    setAssignTarget(subject);
  }

  const rosterColumns: ColumnDef<Student>[] = [
    {
      id: "student",
      header: "Student",
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3 py-0.5">
            <UserAvatar
              photoUrl={s.photoUrl}
              firstName={s.firstName}
              lastName={s.lastName}
              size="sm"
              gradient={DIVISION_AVATAR[s.division]}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {s.firstName} {s.lastName}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "studentId",
      header: "Student ID",
      accessorKey: "id",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">{row.original.id}</span>
      ),
    },
    {
      accessorKey: "gender",
      header: "Gender",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.gender}</span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const active = row.original.isActive;
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full flex-shrink-0",
                active ? "bg-green-500" : "bg-gray-400"
              )}
            />
            <span
              className={cn(
                "text-xs",
                active
                  ? "text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              )}
            >
              {active ? "Active" : "Inactive"}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{schoolClass.name}</h1>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mt-1",
              DIVISION_PILL[schoolClass.division]
            )}
          >
            {schoolClass.division}
          </span>
          <p className="text-sm text-muted-foreground mt-1">
            {schoolClass.academicYear}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const current =
              schoolClass.classTeachers.find((t) => t.isPrimary) ?? schoolClass.classTeachers[0];
            teacherForm.reset({ value: current?.staffId ?? "none" });
            setTeacherOpen(true);
          }}
        >
          Change Class Teacher
        </Button>
      </div>

      {/* Subjects & Teachers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Subjects &amp; Teachers</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              subjectForm.reset({ value: "" });
              setSubjectOpen(true);
            }}
          >
            Add Subject
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {classSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subjects assigned to this class yet.
            </p>
          ) : (
            <div className="rounded-md border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Subject</th>
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Category</th>
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Teacher</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {classSubjects.map((cs) => (
                    <tr
                      key={cs.subjectId}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-medium">{cs.subjectName}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const category = subjectCategoryMap.get(cs.subjectId);
                          if (!category) return null;
                          return (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                CATEGORY_PILL[category]
                              )}
                            >
                              {category}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {cs.teacherName ? (
                          <span>{cs.teacherName}</span>
                        ) : (
                          <span className="italic text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openAssignDialog(cs)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                          title="Assign teacher"
                        >
                          <Pencil size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Student Roster */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <CardTitle className="text-sm font-semibold">
            Students &middot; {schoolClass.academicYear}
          </CardTitle>
          <span className="text-xs rounded-full bg-muted px-2 py-0.5 font-medium">
            {roster.length}
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          <DataTable
            columns={rosterColumns}
            data={roster}
            searchKey="student"
            searchPlaceholder="Search by name…"
          />
        </CardContent>
      </Card>

      {/* Dialog A — Change Class Teacher */}
      <Dialog
        open={teacherOpen}
        onOpenChange={(open) => {
          if (!open) setTeacherOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Class Teacher</DialogTitle>
          </DialogHeader>
          <form onSubmit={teacherForm.handleSubmit(onTeacherSubmit)}>
            <FieldGroup className="py-1">
              <Field>
                <FieldLabel>Class Teacher</FieldLabel>
                <Controller
                  name="value"
                  control={teacherForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Remove class teacher</SelectItem>
                        {availableTeachers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.firstName} {staff.lastName} ({staff.rank})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[teacherForm.formState.errors.value]} />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTeacherOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog B — Add Subject */}
      <Dialog
        open={subjectOpen}
        onOpenChange={(open) => {
          if (!open) setSubjectOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Subject</DialogTitle>
          </DialogHeader>
          {availableSubjects.length === 0 ? (
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                All subjects have been assigned to this class.
              </p>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSubjectOpen(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={subjectForm.handleSubmit(onSubjectSubmit)}>
              <FieldGroup className="py-1">
                <Field>
                  <FieldLabel>Subject</FieldLabel>
                  <Controller
                    name="value"
                    control={subjectForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => { if (v) field.onChange(v); }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSubjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[subjectForm.formState.errors.value]} />
                </Field>
              </FieldGroup>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setSubjectOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog C — Assign Teacher to Subject */}
      <Dialog
        open={assignTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Assign Teacher — {assignTarget?.subjectName}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={assignForm.handleSubmit(onAssignSubmit)}>
            <FieldGroup className="py-1">
              <Field>
                <FieldLabel>Teacher</FieldLabel>
                <Controller
                  name="value"
                  control={assignForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a teacher" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {availableTeachers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.firstName} {staff.lastName} ({staff.rank})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[assignForm.formState.errors.value]} />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAssignTarget(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
