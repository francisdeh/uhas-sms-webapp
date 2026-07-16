"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  TriangleAlert,
  Printer,
  Loader2,
  UserCircle,
  BookOpen,
  Phone,
  Users,
  HeartPulse,
  UserX,
  UserCheck,
  Pencil,
  ArrowLeftRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api/browser";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import { GENDERS, type Student, type ClassRecord } from "@/features/students/types";
import { formatStudentDate } from "@/features/students/utils";
import { StudentIdCard } from "./StudentIdCard";
import { GuardianTab } from "./GuardianTab";
import { MedicalInfoCard } from "./MedicalInfoCard";
import { StudentDocumentsCard } from "./StudentDocumentsCard";
import { cn } from "@/lib/utils";

const DIVISION_BADGE: Record<Student["division"], string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

const AVATAR_GRADIENT: Record<Student["division"], string> = {
  KG: "from-purple-500 to-purple-700",
  "Lower Primary": "from-sky-500 to-sky-700",
  "Upper Primary": "from-blue-500 to-blue-700",
  JHS: "from-orange-500 to-orange-700",
};

const editSchema = z.object({
  firstName: z.string().min(2, { message: "Min 2 characters" }),
  middleName: z.string().optional(),
  lastName: z.string().min(2, { message: "Min 2 characters" }),
  dob: z.string().refine((v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    const age = today.getFullYear() - d.getFullYear();
    return age >= 3 && age <= 20;
  }, { message: "Age must be between 3 and 20" }),
  gender: z.enum(GENDERS, { message: "Select a gender" }),
  phone: z.string().optional(),
  address: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  photoUrl: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

const transferSchema = z.object({
  classId: z.string().min(1, { message: "Select a class" }),
});

type TransferFormValues = z.infer<typeof transferSchema>;

interface ExamSummary {
  id: string;
  name: string;
  term: number;
  academicYear: string;
  isPublished: boolean;
}

interface Props {
  student: Student;
  classes: ClassRecord[];
  /** Base path for the student list/detail routes (admin/deputy-head/
   *  teacher), used for sibling profile links. */
  basePath: string;
  /** Admin-only: exams to link report cards for. Deputy Head has no
   *  per-student report-card route, so this is omitted there. */
  exams?: ExamSummary[];
  /** Whether Edit/Transfer Class are available. Defaults `true` to
   *  preserve existing Admin/DeputyHead behavior unchanged; the new
   *  read-only Teacher view passes `false`. */
  canEdit?: boolean;
  /** For the printable ID card — real school identity instead of a
   *  hardcoded name/logo. */
  school: { name: string; logoUrl: string | null };
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-medium", mono && "font-mono")}>{value ?? "—"}</p>
    </div>
  );
}

export default function StudentDetail({
  student,
  classes,
  basePath,
  exams = [],
  canEdit = true,
  school,
}: Props) {
  useBreadcrumbLabel(student.id, `${student.firstName} ${student.lastName}`);

  const router = useRouter();
  const isAdmin = basePath === "/admin/students";
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: student.firstName,
      middleName: student.middleName ?? "",
      lastName: student.lastName,
      dob: student.dob,
      gender: student.gender,
      phone: student.phone ?? "",
      address: student.address ?? "",
      nationality: student.nationality ?? "",
      religion: student.religion ?? "",
      photoUrl: student.photoUrl ?? "",
    },
  });

  const transferForm = useForm<TransferFormValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { classId: student.classId },
  });

  const editMutation = useMutation({
    mutationFn: (data: EditFormValues) =>
      api.students.update(student.id, {
        firstName: data.firstName,
        middleName: data.middleName?.trim() ? data.middleName.trim() : null,
        lastName: data.lastName,
        dob: data.dob,
        gender: data.gender,
        phone: data.phone || null,
        address: data.address || null,
        nationality: data.nationality || null,
        religion: data.religion || null,
        photoUrl: data.photoUrl || null,
      }),
    onSuccess: () => {
      setEditOpen(false);
      router.refresh();
      toast.success("Student updated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update student.");
    },
  });

  const transferMutation = useMutation({
    // One atomic backend call — closing the old enrollment and opening
    // the new one both happen in the same transaction, so a failure
    // can't leave the student with no active enrollment anywhere.
    mutationFn: ({ classId }: { classId: string }) =>
      api.enrollments.transfer({ studentId: student.id, classId }),
    onSuccess: () => {
      setConfirmTransfer(false);
      setTransferOpen(false);
      router.refresh();
      toast.success("Class transferred");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to transfer class.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.students.deactivate(student.id),
    onSuccess: () => {
      setDeactivateOpen(false);
      router.refresh();
      toast.success("Student deactivated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to deactivate student.");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.students.activate(student.id),
    onSuccess: () => {
      router.refresh();
      toast.success("Student reactivated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to reactivate student.");
    },
  });

  const editIsPending = editMutation.isPending;
  const transferIsPending = transferMutation.isPending;
  const activationIsPending = deactivateMutation.isPending || reactivateMutation.isPending;

  function onEditSubmit(data: EditFormValues) {
    editMutation.mutate(data);
  }

  function onTransferSubmit() {
    setConfirmTransfer(true);
  }

  function handleConfirmTransfer() {
    transferMutation.mutate({ classId: transferForm.getValues("classId") });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar
            photoUrl={student.photoUrl}
            firstName={student.firstName}
            lastName={student.lastName}
            size="lg"
            gradient={AVATAR_GRADIENT[student.division]}
          />
          <div>
            <h1 className="text-xl font-bold">
              {student.firstName} {student.lastName}
            </h1>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">{student.slug}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                  DIVISION_BADGE[student.division]
                )}
              >
                {student.division}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    student.isActive ? "bg-green-500" : "bg-gray-400"
                  )}
                />
                {student.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil size={13} />
                Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight size={13} />
                Transfer Class
              </Button>
            </>
          )}
          {isAdmin &&
            (student.isActive ? (
              <Button variant="destructive" size="sm" onClick={() => setDeactivateOpen(true)}>
                <UserX size={13} />
                Deactivate
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reactivateMutation.mutate()}
                disabled={activationIsPending}
              >
                {activationIsPending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <UserCheck size={13} />
                )}
                Reactivate
              </Button>
            ))}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer size={14} />
            Print ID Card
          </Button>
        </div>
      </div>

      {!student.isActive && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
            This student is currently inactive.
          </AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultValue="profile" className="flex flex-col gap-0">
        <div className="bg-card dark:bg-slate-800/60 border border-border/60 rounded-xl rounded-b-none px-4 pt-3">
          <TabsList variant="line" className="w-full justify-start gap-0">
            <TabsTrigger value="profile" className="cursor-pointer px-4">
              <UserCircle size={15} />Profile
            </TabsTrigger>
            <TabsTrigger value="academic" className="cursor-pointer px-4">
              <BookOpen size={15} />Academic
            </TabsTrigger>
            <TabsTrigger value="contact" className="cursor-pointer px-4">
              <Phone size={15} />Contact
            </TabsTrigger>
            <TabsTrigger value="guardian" className="cursor-pointer px-4">
              <Users size={15} />Guardian
            </TabsTrigger>
            <TabsTrigger value="health" className="cursor-pointer px-4">
              <HeartPulse size={15} />Health &amp; Docs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          <AnimatePresence mode="wait">
            <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="rounded-t-none border-t-0">
                <CardHeader>
                  <CardTitle className="text-base">Personal Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <InfoRow label="First Name" value={student.firstName} />
                    {student.middleName && (
                      <InfoRow label="Other Name(s)" value={student.middleName} />
                    )}
                    <InfoRow label="Last Name" value={student.lastName} />
                    <InfoRow label="Date of Birth" value={formatStudentDate(student.dob)} />
                    <InfoRow label="Gender" value={student.gender} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="academic">
          <AnimatePresence mode="wait">
            <motion.div key="academic" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="rounded-t-none border-t-0">
                <CardHeader>
                  <CardTitle className="text-base">Academic Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <InfoRow label="Student ID" value={student.slug} mono />
                    <InfoRow label="Class" value={student.className} />
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Division</p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          DIVISION_BADGE[student.division]
                        )}
                      >
                        {student.division}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Status</p>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            student.isActive ? "bg-green-500" : "bg-gray-400"
                          )}
                        />
                        <span
                          className={cn(
                            "text-sm font-medium",
                            student.isActive
                              ? "text-green-600 dark:text-green-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {student.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                    <InfoRow label="Enrolled" value={formatStudentDate(student.createdAt)} />
                  </div>
                </CardContent>
              </Card>

              {isAdmin && exams.length > 0 && (
                <Card className="rounded-t-none border-t-0 mt-4">
                  <CardHeader>
                    <CardTitle className="text-base">Report Cards</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      {exams.map((exam) => (
                        <Link
                          key={exam.id}
                          href={`${basePath}/${student.id}/report-card/${exam.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 hover:bg-accent/50 transition-colors"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <Printer size={14} className="text-muted-foreground" />
                            {exam.name}
                          </span>
                          <span className="flex items-center gap-2">
                            {!exam.isPublished && (
                              <Badge variant="outline" className="text-[11px]">
                                Unpublished
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              Term {exam.term} · {exam.academicYear}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="contact">
          <AnimatePresence mode="wait">
            <motion.div key="contact" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="rounded-t-none border-t-0">
                <CardHeader>
                  <CardTitle className="text-base">Contact &amp; Other</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <InfoRow label="Phone" value={student.phone} />
                    <InfoRow label="Nationality" value={student.nationality} />
                    <InfoRow label="Religion" value={student.religion} />
                    <div className="col-span-2">
                      <InfoRow label="Address" value={student.address} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="guardian">
          <AnimatePresence mode="wait">
            <motion.div key="guardian" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <Card className="rounded-t-none border-t-0">
                <CardHeader>
                  <CardTitle className="text-base">Guardians &amp; Siblings</CardTitle>
                </CardHeader>
                <CardContent>
                  <GuardianTab studentId={student.id} basePath={basePath} canEdit={canEdit} />
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="health">
          <AnimatePresence mode="wait">
            <motion.div
              key="health"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="rounded-t-none border border-t-0 border-border/60 bg-card dark:bg-slate-800/60 rounded-b-xl p-4 space-y-4"
            >
              <MedicalInfoCard studentId={student.id} canEdit={isAdmin} />
              <StudentDocumentsCard studentId={student.id} canManage={isAdmin} />
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      {/* Print-only ID card */}
      <div className="hidden print:block">
        <StudentIdCard student={student} school={school} />
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
            <FieldGroup className="gap-4 py-1">
              <Controller
                name="photoUrl"
                control={editForm.control}
                render={({ field }) => (
                  <ImageUploadField
                    ownerId={student.id}
                    kind="students/photo"
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                  />
                )}
              />
              <Field>
                <FieldLabel htmlFor="firstName">First Name</FieldLabel>
                <Input id="firstName" {...editForm.register("firstName")} />
                <FieldError errors={[editForm.formState.errors.firstName]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="middleName">Other Name(s)</FieldLabel>
                <Input id="middleName" {...editForm.register("middleName")} />
                <FieldError errors={[editForm.formState.errors.middleName]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
                <Input id="lastName" {...editForm.register("lastName")} />
                <FieldError errors={[editForm.formState.errors.lastName]} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>Gender</FieldLabel>
                  <Controller
                    name="gender"
                    control={editForm.control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[editForm.formState.errors.gender]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="dob">Date of Birth</FieldLabel>
                  <Input id="dob" type="date" {...editForm.register("dob")} />
                  <FieldError errors={[editForm.formState.errors.dob]} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" type="tel" {...editForm.register("phone")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Textarea id="address" rows={3} {...editForm.register("address")} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="nationality">Nationality</FieldLabel>
                  <Input id="nationality" {...editForm.register("nationality")} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="religion">Religion</FieldLabel>
                  <Input id="religion" {...editForm.register("religion")} />
                </Field>
              </div>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" variant="brand" disabled={editIsPending}>
                {editIsPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Class Dialog */}
      <Dialog open={transferOpen} onOpenChange={(open) => { if (!open) setTransferOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Transfer Class</DialogTitle>
          </DialogHeader>
          <form onSubmit={transferForm.handleSubmit(onTransferSubmit)}>
            <FieldGroup className="gap-4 py-1">
              <Field>
                <FieldLabel>Class</FieldLabel>
                <Controller
                  name="classId"
                  control={transferForm.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={(v) => { if (v) field.onChange(v); }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a class">
                          {(value: string) => classes.find((cls) => cls.id === value)?.name ?? ""}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[transferForm.formState.errors.classId]} />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit">Transfer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer Confirmation */}
      <AlertDialog open={confirmTransfer} onOpenChange={setConfirmTransfer}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Transfer student?</AlertDialogTitle>
            <AlertDialogDescription>
              Transfer {student.firstName} to a new class? This will update their class assignment and division.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmTransfer} disabled={transferIsPending}>
              {transferIsPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate confirmation */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {student.firstName} {student.lastName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be marked inactive. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={() => deactivateMutation.mutate()}
              disabled={activationIsPending}
            >
              {activationIsPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
