"use client";

import { useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Loader2, Trash2, RefreshCw, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ErrorState } from "@/components/ui/error-state";
import { DataTable } from "@/components/ui/data-table";
import {
  useClass,
  useClassSubjects,
  useClassTeachers,
  useAssignClassSubject,
  useRemoveClassSubject,
  useReplacePrimaryClassTeacher,
  useSetClassSubjectTeacher,
  useUpdateClass,
} from "@/features/classes/hooks/use-classes";
import { useSubjects } from "@/features/subjects/hooks/use-subjects";
import { useStaffList } from "@/features/staff/hooks/use-staff";
import { useClassRoster } from "@/features/classes/hooks/use-class-roster";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import { ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";
import { CLASS_NAMES, type Division } from "@/features/classes/types";
import { KG } from "@/features/auth/types";
import { cn } from "@/lib/utils";

type ClassSubjectRead = components["schemas"]["ClassSubjectRead"];
type EnrollmentRead = components["schemas"]["EnrollmentRead"];

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

const CATEGORY_PILL: Record<string, string> = {
  Core: "bg-blue-100 text-blue-700",
  Elective: "bg-orange-100 text-accent-orange",
  Optional: "bg-slate-100 text-slate-700",
};

const selectSchema = z.object({
  value: z.string().min(1, { message: "Select an option" }),
});

type SelectFormValues = z.infer<typeof selectSchema>;

const editClassSchema = z.object({
  name: z.string().min(1, { message: "Select a class" }),
});

type EditClassFormValues = z.infer<typeof editClassSchema>;

interface ClassDetailProps {
  classId: string;
  /** View-only — hides teacher/subject assignment affordances. Every
   * mutation endpoint here is Admin-only server-side (RequireAdmin), so
   * a non-admin viewer (e.g. Deputy Head) must never see edit UI it
   * can't actually use. */
  readonly?: boolean;
}

export default function ClassDetail({ classId, readonly = false }: ClassDetailProps) {
  // Detail — populates the header + drives the primary teacher assign dialog default.
  const { data: schoolClass, isLoading: classLoading, error: classError } = useClass(classId);
  useBreadcrumbLabel(classId, schoolClass?.name);

  // Junctions + roster (all keyed under the class).
  const { data: subjectsData } = useClassSubjects(classId);
  // Memoise so downstream useMemo hooks don't churn when the fetch
  // returns a fresh reference but the same items (React Query does that
  // on background refetches).
  const classSubjects: ClassSubjectRead[] = useMemo(
    () => subjectsData?.items ?? [],
    [subjectsData],
  );

  const { data: teachersData } = useClassTeachers(classId);
  const classTeachers = teachersData?.items ?? [];

  const { data: rosterData } = useClassRoster(classId);
  const roster: EnrollmentRead[] = rosterData?.items ?? [];

  // Pickers for the dialogs — same size as the API's list; upper-bound
  // is high because a small school has ≤ 20 subjects / ≤ 30 staff.
  const { data: allSubjectsData } = useSubjects({ size: 100 });
  const availableSubjects = useMemo(() => {
    const assigned = new Set(classSubjects.map((cs) => cs.subjectId));
    return (allSubjectsData?.items ?? []).filter((s) => !assigned.has(s.id));
  }, [classSubjects, allSubjectsData]);

  const { data: staffData, isLoading: staffLoading } = useStaffList({ activeOnly: true, size: 100 });
  const availableTeachers = staffData?.items ?? [];
  // Base UI's <Select.Value> only resolves a label from <Select.Item>s
  // that have actually mounted (i.e. the dropdown has been opened at
  // least once) — a value set programmatically via form.reset() on a
  // never-opened dropdown falls back to showing the raw value. Passing
  // an explicit children render-prop sidesteps that entirely.
  function teacherLabel(id: string | undefined): string {
    if (!id || id === "none") return "Unassigned";
    const staff = availableTeachers.find((s) => s.id === id);
    if (!staff) return "Unassigned";
    return `${staff.firstName} ${staff.lastName}${staff.rank ? ` (${staff.rank})` : ""}`;
  }

  // Category lookup for the pill under each subject row.
  const subjectCategoryMap = useMemo(() => {
    const m = new Map<string, string>();
    (allSubjectsData?.items ?? []).forEach((s) => {
      if (s.category) m.set(s.id, s.category);
    });
    return m;
  }, [allSubjectsData]);

  // ── Dialog state ────────────────────────────────────────────────────────
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<ClassSubjectRead | null>(null);

  const primaryClassTeacher =
    classTeachers.find((t) => t.isPrimary) ?? classTeachers[0];

  const teacherForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { value: primaryClassTeacher?.staffId ?? "none" },
  });
  const subjectForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { value: "" },
  });
  const assignForm = useForm<SelectFormValues>({
    resolver: zodResolver(selectSchema),
    defaultValues: { value: assignTarget?.teacherId ?? "none" },
  });
  const editForm = useForm<EditClassFormValues>({
    resolver: zodResolver(editClassSchema),
    defaultValues: { name: schoolClass?.name ?? "" },
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateClass = useUpdateClass(classId);
  const replacePrimaryClassTeacher = useReplacePrimaryClassTeacher(classId);
  const assignSubject = useAssignClassSubject(classId);
  const removeSubject = useRemoveClassSubject(classId);
  const setSubjectTeacher = useSetClassSubjectTeacher(classId);

  async function onEditSubmit(data: EditClassFormValues) {
    const entry = CLASS_NAMES.find((c) => c.name === data.name);
    if (!entry) return;
    try {
      await updateClass.mutateAsync({ name: entry.name, division: entry.division });
      toast.success("Class updated.");
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update class.");
    }
  }

  async function onTeacherSubmit(data: SelectFormValues) {
    try {
      // One atomic backend call — removing the old primary and
      // assigning the new one both happen in the same transaction, so
      // a failure can't leave the class with no teacher at all.
      await replacePrimaryClassTeacher.mutateAsync({
        staffId: data.value === "none" ? null : data.value,
      });
      toast.success("Class teacher updated.");
      setTeacherOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update.");
    }
  }

  async function onSubjectSubmit(data: SelectFormValues) {
    try {
      await assignSubject.mutateAsync({ subjectId: data.value });
      toast.success("Subject added.");
      subjectForm.reset({ value: "" });
      setSubjectOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to add subject.");
    }
  }

  async function onAssignSubmit(data: SelectFormValues) {
    if (!assignTarget) return;
    try {
      await setSubjectTeacher.mutateAsync({
        subjectId: assignTarget.subjectId,
        teacherId: data.value === "none" ? null : data.value,
      });
      toast.success("Teacher assigned.");
      setAssignTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to assign teacher.");
    }
  }

  async function onRemoveSubject(subjectId: string) {
    try {
      await removeSubject.mutateAsync(subjectId);
      toast.success("Subject removed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to remove subject.");
    }
  }

  function openAssignDialog(subject: ClassSubjectRead) {
    assignForm.reset({ value: subject.teacherId ?? "none" });
    setAssignTarget(subject);
  }

  const rosterColumns: ColumnDef<EnrollmentRead>[] = [
    {
      id: "student",
      header: "Student",
      accessorFn: (row) =>
        `${row.studentFirstName ?? ""} ${row.studentLastName ?? ""}`.trim(),
      cell: ({ row }) => {
        const s = row.original;
        const div = (s.division ?? KG) as Division;
        return (
          <div className="flex items-center gap-3 py-0.5">
            <UserAvatar
              photoUrl={s.studentPhotoUrl ?? null}
              firstName={s.studentFirstName ?? ""}
              lastName={s.studentLastName ?? ""}
              size="sm"
              gradient={DIVISION_AVATAR[div]}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {s.studentFirstName} {s.studentLastName}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: "studentId",
      header: "Student ID",
      accessorFn: (row) => row.studentSlug ?? row.studentId,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground font-mono">
          {row.original.studentSlug ?? row.original.studentId}
        </span>
      ),
    },
    {
      id: "gender",
      header: "Gender",
      cell: ({ row }) => <span className="text-sm">{row.original.studentGender}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const active = row.original.studentIsActive ?? true;
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full flex-shrink-0",
                active ? "bg-green-500" : "bg-gray-400",
              )}
            />
            <span
              className={cn(
                "text-xs",
                active
                  ? "text-green-600 dark:text-green-400"
                  : "text-muted-foreground",
              )}
            >
              {active ? "Active" : "Inactive"}
            </span>
          </div>
        );
      },
    },
  ];

  if (classError) {
    const is403 = classError instanceof ApiError && classError.status === 403;
    return (
      <div className="flex items-center justify-center py-16">
        <ErrorState
          error={classError}
          title={is403 ? "Access restricted" : "Couldn't load class"}
          description={
            is403
              ? "You may only view classes in your own division."
              : classError.message
          }
          className="w-full max-w-md"
        />
      </div>
    );
  }

  if (classLoading || !schoolClass) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin mr-2" /> Loading class…
      </div>
    );
  }

  const division = schoolClass.division as Division;
  const isTeacherOpMutating = replacePrimaryClassTeacher.isPending;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">{schoolClass.name}</h1>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mt-1",
              DIVISION_PILL[division],
            )}
          >
            {schoolClass.division}
          </span>
          <p className="text-sm text-muted-foreground mt-1">
            {schoolClass.academicYear}
          </p>
        </div>
        {!readonly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                editForm.reset({ name: schoolClass.name });
                setEditOpen(true);
              }}
            >
              <Pencil size={13} className="mr-1.5" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                teacherForm.reset({ value: primaryClassTeacher?.staffId ?? "none" });
                setTeacherOpen(true);
              }}
            >
              <RefreshCw size={13} className="mr-1.5" /> Change Class Teacher
            </Button>
          </div>
        )}
      </div>

      {/* Subjects & Teachers */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Subjects &amp; Teachers</CardTitle>
          {!readonly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                subjectForm.reset({ value: "" });
                setSubjectOpen(true);
              }}
            >
              <Plus size={13} className="mr-1.5" /> Add Subject
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {classSubjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subjects assigned to this class yet.
            </p>
          ) : (
            <div className="rounded-md border border-border/60 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60">
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Subject</th>
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Category</th>
                    <th className="text-left text-xs font-semibold px-4 py-2.5">Teacher</th>
                    {!readonly && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {classSubjects.map((cs) => {
                    const category = subjectCategoryMap.get(cs.subjectId);
                    const teacherName =
                      cs.teacherFirstName || cs.teacherLastName
                        ? `${cs.teacherFirstName ?? ""} ${cs.teacherLastName ?? ""}`.trim()
                        : null;
                    return (
                      <tr
                        key={cs.subjectId}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-4 py-3 font-medium">{cs.subjectName}</td>
                        <td className="px-4 py-3">
                          {category ? (
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                CATEGORY_PILL[category],
                              )}
                            >
                              {category}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {teacherName ? (
                            <span>{teacherName}</span>
                          ) : (
                            <span className="italic text-muted-foreground">Unassigned</span>
                          )}
                        </td>
                        {!readonly && (
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => openAssignDialog(cs)}
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                title="Assign teacher"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => onRemoveSubject(cs.subjectId)}
                                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                title="Remove subject from class"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
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

      {/* Dialog — Edit Class */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit class</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
            <FieldGroup className="py-1">
              <Field>
                <FieldLabel>Class Name</FieldLabel>
                <Controller
                  name="name"
                  control={editForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => { if (v) field.onChange(v); }}
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
                <FieldError errors={[editForm.formState.errors.name]} />
              </Field>
              <p className="text-xs text-muted-foreground">
                Academic year can&apos;t be changed after creation.
              </p>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={updateClass.isPending}>
                {updateClass.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog A — Change Class Teacher */}
      <Dialog open={teacherOpen} onOpenChange={(open) => { if (!open) setTeacherOpen(false); }}>
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
                      disabled={staffLoading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={staffLoading ? "Loading teachers…" : "Select a teacher"}>
                          {(value: string) => teacherLabel(value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Remove class teacher</SelectItem>
                        {availableTeachers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.firstName} {staff.lastName}
                            {staff.rank ? ` (${staff.rank})` : ""}
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
              <Button type="button" variant="ghost" onClick={() => setTeacherOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={isTeacherOpMutating}>
                {isTeacherOpMutating && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog B — Add Subject */}
      <Dialog open={subjectOpen} onOpenChange={(open) => { if (!open) setSubjectOpen(false); }}>
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
                <Button type="button" variant="ghost" onClick={() => setSubjectOpen(false)}>
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
                          <SelectValue placeholder="Select a subject">
                            {(value: string) =>
                              availableSubjects.find((subject) => subject.id === value)?.name ?? ""
                            }
                          </SelectValue>
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
                <Button type="button" variant="ghost" onClick={() => setSubjectOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="brand" disabled={assignSubject.isPending}>
                  {assignSubject.isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
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
        onOpenChange={(open) => { if (!open) setAssignTarget(null); }}
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
                      disabled={staffLoading}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={staffLoading ? "Loading teachers…" : "Select a teacher"}>
                          {(value: string) => teacherLabel(value)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {availableTeachers.map((staff) => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.firstName} {staff.lastName}
                            {staff.rank ? ` (${staff.rank})` : ""}
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
              <Button type="button" variant="ghost" onClick={() => setAssignTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={setSubjectTeacher.isPending}>
                {setSubjectTeacher.isPending && (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                )}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
