"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { TriangleAlert, Printer, Loader2, UserCircle, BookOpen, Phone, Users } from "lucide-react";
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
import { updateStudentAction, transferStudentAction } from "@/features/students/actions";
import type { Student, ClassRecord, GuardianProfile } from "@/features/students/types";
import { formatStudentDate } from "@/features/students/utils";
import { StudentIdCard } from "./StudentIdCard";
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
  lastName: z.string().min(2, { message: "Min 2 characters" }),
  dob: z.string().refine((v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    const age = today.getFullYear() - d.getFullYear();
    return age >= 3 && age <= 20;
  }, { message: "Age must be between 3 and 20" }),
  gender: z.enum(["Male", "Female"], { message: "Select a gender" }),
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

interface Props {
  student: Student;
  classes: ClassRecord[];
  guardian: GuardianProfile | null;
}

function InfoRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-medium", mono && "font-mono")}>{value ?? "—"}</p>
    </div>
  );
}

export default function StudentDetail({ student, classes, guardian }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [editIsPending, startEditTransition] = useTransition();
  const [transferIsPending, startTransferTransition] = useTransition();

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: student.firstName,
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

  function onEditSubmit(data: EditFormValues) {
    startEditTransition(async () => {
      const result = await updateStudentAction(student.id, data);
      if (!result.success) { toast.error(result.error); return; }
      setEditOpen(false);
      router.refresh();
      toast.success("Student updated");
    });
  }

  function onTransferSubmit() {
    setConfirmTransfer(true);
  }

  function handleConfirmTransfer() {
    startTransferTransition(async () => {
      const result = await transferStudentAction(student.id, {
        classId: transferForm.getValues("classId"),
      });
      if (!result.success) { toast.error(result.error); return; }
      setConfirmTransfer(false);
      setTransferOpen(false);
      router.refresh();
      toast.success("Class transferred");
    });
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
            <p className="text-sm text-muted-foreground font-mono mt-0.5">{student.id}</p>
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
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)}>
            Transfer Class
          </Button>
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
                    <InfoRow label="Student ID" value={student.id} mono />
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
                  <CardTitle className="text-base">Guardian Information</CardTitle>
                </CardHeader>
                <CardContent>
                  {guardian ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <InfoRow label="Name" value={guardian.name} />
                      <InfoRow label="Relationship" value={guardian.relationship} />
                      <InfoRow label="Phone" value={guardian.phone} />
                      <InfoRow label="Email" value={guardian.email} />
                      <InfoRow label="Guardian ID" value={guardian.id} mono />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No guardian has been linked to this student.
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      {/* Print-only ID card */}
      <div className="hidden print:block">
        <StudentIdCard student={student} />
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
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
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
              <Button type="submit" disabled={editIsPending}>
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
                        <SelectValue placeholder="Select a class" />
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
    </div>
  );
}
