"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Copy, Check } from "lucide-react";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { createStaffAction } from "@/features/staff/actions";
import { STAFF_SYSTEM_ROLES } from "@/features/auth/types";

const schema = z
  .object({
    uhasId: z
      .string()
      .regex(/^UHAS\d{3,5}$/, { message: "Format: UHAS followed by 3–5 digits, e.g. UHAS1141" })
      .optional()
      .or(z.literal("")),
    firstName: z.string().min(2, { message: "Must be at least 2 characters" }),
    lastName: z.string().min(2, { message: "Must be at least 2 characters" }),
    rank: z.string().min(2, { message: "Must be at least 2 characters" }),
    systemRole: z.enum(STAFF_SYSTEM_ROLES, {
      message: "Select a role",
    }),
    division: z.enum(["KG", "Lower Primary", "Upper Primary", "JHS"]).optional(),
    isUnitHead: z.boolean().optional(),
    unitHeadOf: z.enum(["KG", "Lower Primary", "Upper Primary", "JHS"]).optional(),
    phone: z.string().min(7, { message: "Enter a valid phone number" }),
    email: z.string().email({ message: "Enter a valid email address" }),
    photoUrl: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.systemRole === "DeputyHead" || data.systemRole === "Teacher") {
        return !!data.division;
      }
      return true;
    },
    { message: "Division is required for this role", path: ["division"] }
  )
  .refine(
    (data) => {
      if (data.isUnitHead) return !!data.unitHeadOf;
      return true;
    },
    { message: "Pick which unit this staff heads", path: ["unitHeadOf"] }
  );

type FormValues = z.infer<typeof schema>;

interface SuccessState {
  id: string;
  inviteLink: string;
  firstName: string;
  lastName: string;
}

interface StaffRegistrationFormProps {
  listHref: string;
}

export default function StaffRegistrationForm({
  listHref,
}: StaffRegistrationFormProps) {
  const router = useRouter();
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [copied, setCopied] = useState(false);
  const [tempId] = useState(() => `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const systemRole = useWatch({ control, name: "systemRole" });
  const isUnitHead = useWatch({ control, name: "isUnitHead" });
  const showDivision = systemRole === "DeputyHead" || systemRole === "Teacher";
  const canBeUnitHead = systemRole === "Teacher";

  async function onSubmit(values: FormValues) {
    const result = await createStaffAction(values);
    if (result.success) {
      setSuccessState({
        id: result.id,
        inviteLink: result.inviteLink,
        firstName: values.firstName,
        lastName: values.lastName,
      });
    } else {
      toast.error(result.error);
    }
  }

  async function handleCopyLink() {
    if (!successState) return;
    if (!navigator.clipboard) {
      toast.error("Clipboard not available in this context");
      return;
    }
    await navigator.clipboard.writeText(successState.inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Register Staff</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add a new staff member to the school records.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Information</CardTitle>
          <CardDescription>
            Fill in all required details below to register a staff member.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="gap-5">
              <Controller
                name="photoUrl"
                control={control}
                render={({ field }) => (
                  <ImageUploadField
                    ownerId={tempId}
                    kind="staff/photo"
                    value={field.value ?? null}
                    onChange={(v) => field.onChange(v ?? "")}
                  />
                )}
              />

              <Field>
                <FieldLabel htmlFor="uhasId">UHAS Staff ID (optional)</FieldLabel>
                <Input
                  id="uhasId"
                  placeholder="e.g. UHAS1141"
                  {...register("uhasId")}
                />
                <FieldError errors={[errors.uhasId]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="firstName">First Name</FieldLabel>
                <Input
                  id="firstName"
                  placeholder="e.g. Kofi"
                  {...register("firstName")}
                />
                <FieldError errors={[errors.firstName]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="lastName">Last Name</FieldLabel>
                <Input
                  id="lastName"
                  placeholder="e.g. Mensah"
                  {...register("lastName")}
                />
                <FieldError errors={[errors.lastName]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="rank">Rank</FieldLabel>
                <Input
                  id="rank"
                  placeholder="e.g. Class Teacher"
                  {...register("rank")}
                />
                <FieldError errors={[errors.rank]} />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>System Role</FieldLabel>
                  <Controller
                    name="systemRole"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          if (v) field.onChange(v);
                        }}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="DeputyHead">
                            Deputy Head
                          </SelectItem>
                          <SelectItem value="Teacher">Teacher</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.systemRole]} />
                </Field>

                {showDivision ? (
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
                            <SelectValue placeholder="Select division" />
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
                    <FieldError errors={[errors.division]} />
                  </Field>
                ) : (
                  <div />
                )}
              </div>

              {canBeUnitHead && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel>Unit Head?</FieldLabel>
                    <Controller
                      name="isUnitHead"
                      control={control}
                      render={({ field }) => (
                        <Select
                          value={field.value ? "yes" : "no"}
                          onValueChange={(v) => field.onChange(v === "yes")}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="No" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">No</SelectItem>
                            <SelectItem value="yes">Yes</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>

                  {isUnitHead && (
                    <Field>
                      <FieldLabel>Head of Unit</FieldLabel>
                      <Controller
                        name="unitHeadOf"
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(v) => {
                              if (v) field.onChange(v);
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select unit" />
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
                      <FieldError errors={[errors.unitHeadOf]} />
                    </Field>
                  )}
                </div>
              )}

              <Separator />

              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="e.g. 0244 000 000"
                  {...register("phone")}
                />
                <FieldError errors={[errors.phone]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="e.g. kofi.mensah@school.edu.gh"
                  {...register("email")}
                />
                <FieldError errors={[errors.email]} />
              </Field>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-slate-800 text-white hover:bg-slate-900 active:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {isSubmitting && (
                    <Loader2 size={15} className="animate-spin mr-2" />
                  )}
                  {isSubmitting ? "Registering…" : "Register Staff"}
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

      <Dialog
        open={!!successState}
        onOpenChange={(open) => {
          if (!open) setSuccessState(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Staff member registered</DialogTitle>
            <DialogDescription>
              {successState
                ? `${successState.firstName} ${successState.lastName} has been registered with ID ${successState.id}.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Invite link</p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={successState?.inviteLink ?? ""}
                className="flex-1 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleCopyLink}
                aria-label="Copy link"
              >
                {copied ? (
                  <Check size={14} className="text-green-600" />
                ) : (
                  <Copy size={14} />
                )}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setSuccessState(null);
                router.push(listHref);
              }}
              className="bg-accent-orange text-white hover:bg-accent-orange/90 focus-visible:ring-accent-orange/40"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
