"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  TriangleAlert,
  Loader2,
  UserCircle,
  ShieldCheck,
  UserX,
  UserCheck,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { api, ApiError } from "@/lib/api/browser";
import { TEACHER_RANKS, type Staff } from "@/features/staff/types";
import { formatStudentDate } from "@/features/students/utils";
import { cn } from "@/lib/utils";
import { STAFF_SYSTEM_ROLES } from "@/features/auth/types";

const ROLE_AVATAR: Record<Staff["systemRole"], string> = {
  Admin: "from-purple-400 to-purple-600",
  DeputyHead: "from-blue-400 to-blue-600",
  Teacher: "from-orange-400 to-accent-orange",
  Accountant: "from-emerald-400 to-emerald-600",
};

const ROLE_PILL: Record<Staff["systemRole"], string> = {
  Admin: "bg-purple-100 text-purple-700",
  DeputyHead: "bg-blue-100 text-blue-700",
  Teacher: "bg-orange-100 text-accent-orange",
  Accountant: "bg-emerald-100 text-emerald-700",
};

const ROLE_LABEL: Record<Staff["systemRole"], string> = {
  Admin: "Admin",
  DeputyHead: "Deputy Head",
  Teacher: "Teacher",
  Accountant: "Accountant",
};

const editSchema = z.object({
  firstName: z.string().min(2, { message: "Min 2 characters" }),
  lastName: z.string().min(2, { message: "Min 2 characters" }),
  rank: z.enum(TEACHER_RANKS).nullish(),
  phone: z.string().min(7, { message: "Min 7 characters" }),
  email: z.string().email({ message: "Enter a valid email" }),
  photoUrl: z.string().optional(),
});

type EditFormValues = z.infer<typeof editSchema>;

const changeRoleSchema = z
  .object({
    systemRole: z.enum(STAFF_SYSTEM_ROLES, {
      message: "Select a role",
    }),
    division: z.enum(["KG", "Lower Primary", "Upper Primary", "JHS"]).optional(),
  })
  .refine(
    (data) => {
      if (data.systemRole === "DeputyHead" || data.systemRole === "Teacher") {
        return !!data.division;
      }
      return true;
    },
    { message: "Division is required for this role", path: ["division"] }
  );

type ChangeRoleFormValues = z.infer<typeof changeRoleSchema>;

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-medium", mono && "font-mono")}>
        {value ?? "—"}
      </p>
    </div>
  );
}

interface StaffDetailProps {
  staff: Staff;
}

export default function StaffDetail({ staff }: StaffDetailProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: staff.firstName,
      lastName: staff.lastName,
      rank: staff.rank,
      phone: staff.phone,
      email: staff.email,
      photoUrl: staff.photoUrl ?? "",
    },
  });

  const roleForm = useForm<ChangeRoleFormValues>({
    resolver: zodResolver(changeRoleSchema),
    defaultValues: {
      systemRole: staff.systemRole,
      division: staff.division ?? undefined,
    },
  });

  const watchedRole = useWatch({ control: roleForm.control, name: "systemRole" });
  const showDivision = watchedRole === "DeputyHead" || watchedRole === "Teacher";

  const editMutation = useMutation({
    mutationFn: (data: EditFormValues) =>
      api.staff.update(staff.id, {
        firstName: data.firstName,
        lastName: data.lastName,
        rank: data.rank ?? null,
        phone: data.phone,
        email: data.email,
        photoUrl: data.photoUrl || null,
      }),
    onSuccess: () => {
      setEditOpen(false);
      router.refresh();
      toast.success("Staff updated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update staff.");
    },
  });

  const roleMutation = useMutation({
    mutationFn: (data: ChangeRoleFormValues) =>
      api.staff.changeRole(staff.id, {
        systemRole: data.systemRole,
        division: data.division ?? null,
      }),
    onSuccess: () => {
      setRoleOpen(false);
      router.refresh();
      toast.success("Role updated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to change role.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: () => api.staff.deactivate(staff.id),
    onSuccess: () => {
      setDeactivateOpen(false);
      router.refresh();
      toast.success("Staff deactivated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to deactivate staff.");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api.staff.activate(staff.id),
    onSuccess: () => {
      router.refresh();
      toast.success("Staff reactivated");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to reactivate staff.");
    },
  });

  const editIsPending = editMutation.isPending;
  const roleIsPending =
    roleMutation.isPending || deactivateMutation.isPending || reactivateMutation.isPending;

  function onEditSubmit(data: EditFormValues) {
    editMutation.mutate(data);
  }

  function onRoleSubmit(data: ChangeRoleFormValues) {
    roleMutation.mutate(data);
  }

  function handleDeactivate() {
    deactivateMutation.mutate();
  }

  function handleReactivate() {
    reactivateMutation.mutate();
  }

  return (
    <div className="space-y-5">
      {/* Inactive banner */}
      {!staff.isActive && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20">
          <TriangleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
            This staff member is currently inactive.
          </AlertDescription>
        </Alert>
      )}

      {/* Avatar + name header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <UserAvatar
          photoUrl={staff.photoUrl}
          firstName={staff.firstName}
          lastName={staff.lastName}
          size="lg"
          gradient={ROLE_AVATAR[staff.systemRole]}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">
            {staff.firstName} {staff.lastName}
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">{staff.id}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                ROLE_PILL[staff.systemRole]
              )}
            >
              {ROLE_LABEL[staff.systemRole]}
            </span>
            {staff.division && (
              <span className="text-xs text-muted-foreground">{staff.division}</span>
            )}
            <span className="flex items-center gap-1 text-xs">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full flex-shrink-0",
                  staff.isActive ? "bg-green-500" : "bg-gray-400"
                )}
              />
              <span
                className={cn(
                  staff.isActive
                    ? "text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                )}
              >
                {staff.isActive ? "Active" : "Inactive"}
              </span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} className="mr-1.5" /> Edit Info
          </Button>
          {staff.isActive ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeactivateOpen(true)}
            >
              <UserX size={13} className="mr-1.5" /> Deactivate
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReactivate}
              disabled={roleIsPending}
            >
              {roleIsPending ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <UserCheck size={13} className="mr-1.5" />
              )}
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="flex flex-col gap-0">
        <div className="bg-card dark:bg-slate-800/60 border border-border/60 rounded-xl rounded-b-none px-4 pt-3">
          <TabsList variant="line" className="w-full justify-start gap-0">
            <TabsTrigger value="profile" className="cursor-pointer px-4">
              <UserCircle size={14} className="mr-1.5" /> Profile
            </TabsTrigger>
            <TabsTrigger value="access" className="cursor-pointer px-4">
              <ShieldCheck size={14} className="mr-1.5" /> Access
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          <AnimatePresence mode="wait">
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Card className="rounded-t-none border-t-0">
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    <InfoRow label="First Name" value={staff.firstName} />
                    <InfoRow label="Last Name" value={staff.lastName} />
                    <InfoRow label="Rank" value={staff.rank ?? "—"} />
                    <InfoRow label="Phone" value={staff.phone} />
                    <InfoRow label="Email" value={staff.email} />
                    <InfoRow label="Enrolled" value={formatStudentDate(staff.createdAt)} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="access">
          <AnimatePresence mode="wait">
            <motion.div
              key="access"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <Card className="rounded-t-none border-t-0">
                <CardContent className="pt-5 space-y-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                    <InfoRow label="Staff ID" value={staff.id} mono />
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">System Role</p>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          ROLE_PILL[staff.systemRole]
                        )}
                      >
                        {ROLE_LABEL[staff.systemRole]}
                      </span>
                    </div>
                    <InfoRow label="Division" value={staff.division ?? "—"} />
                  </div>
                  <div className="pt-2 border-t border-border/60">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRoleOpen(true)}
                    >
                      <RefreshCw size={13} className="mr-1.5" /> Change Role
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>

      {/* Edit Info Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Staff Info</DialogTitle>
            <DialogDescription>
              Update personal and contact details for {staff.firstName} {staff.lastName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
            <FieldGroup className="gap-4 py-1">
              <Controller
                name="photoUrl"
                control={editForm.control}
                render={({ field }) => (
                  <ImageUploadField
                    ownerId={staff.id}
                    kind="staff/photo"
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                  />
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="edit-firstName">First Name</FieldLabel>
                  <Input id="edit-firstName" {...editForm.register("firstName")} />
                  <FieldError errors={[editForm.formState.errors.firstName]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-lastName">Last Name</FieldLabel>
                  <Input id="edit-lastName" {...editForm.register("lastName")} />
                  <FieldError errors={[editForm.formState.errors.lastName]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="edit-rank">Rank</FieldLabel>
                <Controller
                  control={editForm.control}
                  name="rank"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(v) => field.onChange(v || null)}
                    >
                      <SelectTrigger id="edit-rank">
                        <SelectValue placeholder="Select a rank (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEACHER_RANKS.map((rank) => (
                          <SelectItem key={rank} value={rank}>
                            {rank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[editForm.formState.errors.rank]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-phone">Phone</FieldLabel>
                <Input id="edit-phone" type="tel" {...editForm.register("phone")} />
                <FieldError errors={[editForm.formState.errors.phone]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-email">Email</FieldLabel>
                <Input id="edit-email" type="email" {...editForm.register("email")} />
                <FieldError errors={[editForm.formState.errors.email]} />
              </Field>
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

      {/* Change Role Dialog */}
      <Dialog open={roleOpen} onOpenChange={(open) => { if (!open) setRoleOpen(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the system role for {staff.firstName} {staff.lastName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={roleForm.handleSubmit(onRoleSubmit)}>
            <FieldGroup className="gap-4 py-1">
              <Field>
                <FieldLabel>System Role</FieldLabel>
                <Controller
                  name="systemRole"
                  control={roleForm.control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v) {
                          field.onChange(v);
                          if (v === "Admin") {
                            roleForm.setValue("division", undefined);
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="DeputyHead">Deputy Head</SelectItem>
                        <SelectItem value="Teacher">Teacher</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[roleForm.formState.errors.systemRole]} />
              </Field>

              {showDivision && (
                <Field>
                  <FieldLabel>Division</FieldLabel>
                  <Controller
                    name="division"
                    control={roleForm.control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => { if (v) field.onChange(v); }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a division" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="KG">KG</SelectItem>
                          <SelectItem value="Lower Primary">Lower Primary</SelectItem>
                          <SelectItem value="Upper Primary">Upper Primary</SelectItem>
                          <SelectItem value="JHS">JHS</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[roleForm.formState.errors.division]} />
                </Field>
              )}
            </FieldGroup>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={roleIsPending}>
                {roleIsPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
                Save role
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate AlertDialog */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {staff.firstName} {staff.lastName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will lose system access. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeactivate}
              disabled={roleIsPending}
            >
              {roleIsPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
