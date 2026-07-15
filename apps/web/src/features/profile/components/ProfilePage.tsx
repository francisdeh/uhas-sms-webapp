"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Shield, Monitor, UserCircle, Bell as BellIcon, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { TwoFactorCard } from "@/features/profile/components/TwoFactorCard";
import { PhoneChangeCard } from "@/features/profile/components/PhoneChangeCard";
import { EmailChangeCard } from "@/features/profile/components/EmailChangeCard";
import { StaffDocumentsCard } from "@/features/staff/components/StaffDocumentsCard";
import { api, ApiError } from "@/lib/api/browser";
import { useRouter, useSearchParams } from "next/navigation";
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
import type { SessionUser } from "@/features/auth/types";
import { ADMIN, DEPUTY_HEAD, PARENT, TEACHER } from "@/features/auth/types";

const profileSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters" }),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, { message: "Current password is required" }),
    newPassword: z.string().min(8, { message: "Must be at least 8 characters" }),
    confirmPassword: z.string().min(1, { message: "Please confirm your password" }),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

interface ProfilePageProps {
  user: SessionUser;
}

const PROFILE_TABS = ["profile", "security", "notifications", "danger"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

export function ProfilePage(props: ProfilePageProps) {
  // useSearchParams() requires a Suspense boundary — kept internal so
  // the 4 role route files can keep rendering <ProfilePage /> plainly.
  return (
    <Suspense fallback={null}>
      <ProfilePageContent {...props} />
    </Suspense>
  );
}

function ProfilePageContent({ user }: ProfilePageProps) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: ProfileTab = PROFILE_TABS.includes(requestedTab as ProfileTab)
    ? (requestedTab as ProfileTab)
    : "profile";

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your account, security, and preferences.</p>
      </div>

      <Tabs defaultValue={initialTab} className="flex flex-col gap-0">
        <div className="bg-card dark:bg-slate-800/60 border border-border/60 rounded-xl rounded-b-none px-4 pt-3">
          <TabsList variant="line" className="w-full justify-start gap-0">
            <TabsTrigger value="profile" className="cursor-pointer px-4"><UserCircle size={15} />Profile</TabsTrigger>
            <TabsTrigger value="security" className="cursor-pointer px-4"><Shield size={15} />Security</TabsTrigger>
            <TabsTrigger value="notifications" className="cursor-pointer px-4"><BellIcon size={15} />Notifications</TabsTrigger>
            <TabsTrigger value="danger" className="cursor-pointer px-4"><AlertTriangle size={15} />Danger Zone</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile">
          <AnimatePresence mode="wait">
            <motion.div key="profile" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <ProfileTab user={user} />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="security">
          <AnimatePresence mode="wait">
            <motion.div key="security" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <SecurityTab />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="notifications">
          <AnimatePresence mode="wait">
            <motion.div key="notifications" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <NotificationsTab user={user} />
            </motion.div>
          </AnimatePresence>
        </TabsContent>

        <TabsContent value="danger">
          <AnimatePresence mode="wait">
            <motion.div key="danger" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              <DangerTab user={user} />
            </motion.div>
          </AnimatePresence>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab({ user }: { user: SessionUser }) {
  const router = useRouter();
  // Documents (view-only) are still shown for staff — separate from, and
  // unaffected by, the photo-upload removal below.
  const hasLinkedStaffRecord = !!user.linkedId && user.role !== PARENT;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName },
  });

  async function onSubmit(values: ProfileValues) {
    try {
      await api.me.update({ displayName: values.displayName });
      toast.success("Profile updated successfully.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update profile.");
    }
  }

  return (
    <div className="space-y-6">
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Personal Information</CardTitle>
        <CardDescription>Update your name and contact info.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <UserAvatar
            photoUrl={null}
            firstName={user.displayName?.split(" ")[0] ?? "?"}
            lastName={user.displayName?.split(" ").slice(1).join(" ") ?? ""}
            size="lg"
            gradient="from-accent-orange to-red-400"
          />
          <div className="flex-1">
            <p className="font-semibold">{user.displayName}</p>
            <p className="text-sm text-muted-foreground">{user.email || "—"}</p>
            {user.slug && (
              <p className="text-xs text-muted-foreground mt-0.5">Staff ID: {user.slug}</p>
            )}
            <Badge variant="secondary" className="mt-1.5 text-xs">{user.role}</Badge>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="gap-4 max-w-sm">
            <Field>
              <FieldLabel htmlFor="displayName">Display Name</FieldLabel>
              <Input id="displayName" className="rounded-md" {...register("displayName")} />
              <FieldError errors={[errors.displayName]} />
            </Field>

            <Button type="submit" variant="ink" className="px-5 py-2 h-auto text-sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              Save Changes
            </Button>
          </FieldGroup>
        </form>

        <div className="max-w-sm mt-4 space-y-4">
          <EmailChangeCard currentEmail={user.email ?? null} />
          <PhoneChangeCard currentPhone={user.phone ?? null} usedForLogin={user.role === PARENT} />
          <p className="text-xs text-muted-foreground">
            {user.role === PARENT
              ? "Your email or phone number is also how you sign in — changing either one changes what you use to log in next time."
              : "Your email is also how you sign in — changing it changes what you use to log in next time. Your phone number is for contact and SMS notifications only."}
          </p>
        </div>
      </CardContent>
    </Card>

    {hasLinkedStaffRecord && user.linkedId && (
      <StaffDocumentsCard staffId={user.linkedId} canManage={false} />
    )}
    </div>
  );
}

function SecurityTab() {
  const [signOutOthersOpen, setSignOutOthersOpen] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  async function onPasswordSubmit({ currentPassword, newPassword }: PasswordValues) {
    const supabase = createSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email;
    if (!user || !email) {
      toast.error("Not authenticated.");
      return;
    }
    // Verify the current password by re-signing-in with it. Supabase
    // doesn't expose a separate reauthenticate API — a successful
    // signInWithPassword on the same account is the equivalent.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) {
      toast.error("Current password is incorrect.");
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      // Same Supabase error codes ChangePasswordForm handles — keep the
      // messaging consistent across both password-change surfaces.
      if (updateError.code === "same_password") {
        toast.error("New password must be different from your current one.");
      } else if (updateError.code === "weak_password") {
        toast.error("Password is too weak. Try a longer, less common phrase.");
      } else {
        toast.error("Failed to update password. Please try again.");
      }
      return;
    }
    toast.success("Password updated successfully.");
    reset();
  }

  async function handleSignOutOthers() {
    setSigningOutOthers(true);
    // `scope: 'others'` revokes every other session's refresh token but
    // leaves this one intact — so no redirect, the user stays put.
    const { error } = await createSupabaseClient().auth.signOut({ scope: "others" });
    setSigningOutOthers(false);
    setSignOutOthersOpen(false);
    if (error) {
      toast.error(error.message || "Could not sign out other sessions.");
      return;
    }
    toast.success("Signed out of all other devices.");
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-t-none border-t-0">
        <CardHeader>
          <CardTitle className="text-base">Change Password</CardTitle>
          <CardDescription>Use a strong password you don&apos;t use elsewhere.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onPasswordSubmit)}>
            <FieldGroup className="gap-4 max-w-sm">
              <Field>
                <FieldLabel htmlFor="currentPassword">Current Password</FieldLabel>
                <Input id="currentPassword" type="password" className="rounded-md" autoComplete="current-password" suppressHydrationWarning {...register("currentPassword")} />
                <FieldError errors={[errors.currentPassword]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="newPassword">New Password</FieldLabel>
                <Input id="newPassword" type="password" className="rounded-md" autoComplete="new-password" suppressHydrationWarning {...register("newPassword")} />
                <FieldError errors={[errors.newPassword]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmPassword">Confirm New Password</FieldLabel>
                <Input id="confirmPassword" type="password" className="rounded-md" autoComplete="new-password" suppressHydrationWarning {...register("confirmPassword")} />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>
              <Button type="submit" variant="ink" className="px-5 py-2 h-auto text-sm" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Update Password
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <TwoFactorCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Sessions</CardTitle>
          <CardDescription>
            Signed in on a shared or public computer? Sign out of all other sessions. You&apos;ll
            stay signed in on this device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-green-50/60 border border-green-200">
            <Monitor size={16} className="text-green-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">This device</p>
              <p className="text-xs text-muted-foreground">Currently active</p>
            </div>
            <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">
              Current
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSignOutOthersOpen(true)}>
            Sign out other devices
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={signOutOthersOpen}
        onOpenChange={(o) => !signingOutOthers && setSignOutOthersOpen(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This signs you out everywhere except this device. Anyone signed in on another
              browser or device will need to log in again. You&apos;ll stay signed in here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={signingOutOthers}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleSignOutOthers();
              }}
              disabled={signingOutOthers}
            >
              {signingOutOthers && <Loader2 size={14} className="mr-2 animate-spin" />}
              Sign out other devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type PreferenceField =
  | "emailOnLessonPlanRejected"
  | "emailOnResultsPublished"
  | "emailOnAppointmentActivity"
  | "smsOnAppointmentActivity"
  | "emailOnAppointmentDecided"
  | "smsOnAppointmentDecided"
  | "emailOnLeaveActivity"
  | "smsOnLeaveActivity"
  | "emailOnLeaveDecided"
  | "smsOnLeaveDecided"
  | "emailOnAttendanceAbsent"
  | "smsOnAttendanceAbsent"
  | "emailOnAssignmentCreated"
  | "smsOnAssignmentCreated";

type PreferenceRowConfig = {
  field: PreferenceField;
  label: string;
  description: string;
};

const TEACHER_PREFERENCE_ROWS: PreferenceRowConfig[] = [
  {
    field: "emailOnLessonPlanRejected",
    label: "Email — Lesson Plan Rejected",
    description: "Receive an email when a reviewer sends one of your lesson plans back for changes.",
  },
  {
    field: "emailOnAppointmentActivity",
    label: "Email — Appointment Requests",
    description: "Receive an email when a parent requests or cancels a meeting with you.",
  },
  {
    field: "smsOnAppointmentActivity",
    label: "SMS — Appointment Requests",
    description: "Receive a text message when a parent requests or cancels a meeting with you.",
  },
];

const PARENT_PREFERENCE_ROWS: PreferenceRowConfig[] = [
  {
    field: "emailOnResultsPublished",
    label: "Email — Results Published",
    description: "Receive an email when your child's results are published.",
  },
  {
    field: "emailOnAppointmentDecided",
    label: "Email — Appointment Responses",
    description: "Receive an email when a teacher responds to your meeting request.",
  },
  {
    field: "smsOnAppointmentDecided",
    label: "SMS — Appointment Responses",
    description: "Receive a text message when a teacher responds to your meeting request.",
  },
  {
    field: "emailOnAttendanceAbsent",
    label: "Email — Absence Alerts",
    description: "Receive an email the first time your child is marked absent that day.",
  },
  {
    field: "smsOnAttendanceAbsent",
    label: "SMS — Absence Alerts",
    description: "Receive a text message the first time your child is marked absent that day.",
  },
  {
    field: "emailOnAssignmentCreated",
    label: "Email — New Assignments",
    description: "Receive an email when a new assignment is posted for your child's class.",
  },
  {
    field: "smsOnAssignmentCreated",
    label: "SMS — New Assignments",
    description: "Receive a text message when a new assignment is posted for your child's class.",
  },
];

// Shared by Admin and Deputy Head — both are leave approvers, and both
// can also submit their own leave request as a staff member, so both
// directions (activity + decided) apply to either role identically.
const LEAVE_APPROVER_PREFERENCE_ROWS: PreferenceRowConfig[] = [
  {
    field: "emailOnLeaveActivity",
    label: "Email — Leave Requests Submitted",
    description: "Receive an email when a staff member requests leave.",
  },
  {
    field: "smsOnLeaveActivity",
    label: "SMS — Leave Requests Submitted",
    description: "Receive a text message when a staff member requests leave.",
  },
  {
    field: "emailOnLeaveDecided",
    label: "Email — Your Leave Requests",
    description: "Receive an email when your own leave request is approved or rejected.",
  },
  {
    field: "smsOnLeaveDecided",
    label: "SMS — Your Leave Requests",
    description: "Receive a text message when your own leave request is approved or rejected.",
  },
];

function NotificationsTab({ user }: { user: SessionUser }) {
  const rows =
    user.role === TEACHER
      ? TEACHER_PREFERENCE_ROWS
      : user.role === PARENT
        ? PARENT_PREFERENCE_ROWS
        : user.role === ADMIN || user.role === DEPUTY_HEAD
          ? LEAVE_APPROVER_PREFERENCE_ROWS
          : [];

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Notification Preferences</CardTitle>
        <CardDescription>Choose how you want to receive notifications.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length > 0 ? (
          <div className="flex flex-col gap-4">
            {rows.map((row, i) => (
              <div key={row.field} className="flex flex-col gap-4">
                {i > 0 && <Separator />}
                <PreferenceRow user={user} row={row} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            There&apos;s nothing to configure for your role yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PreferenceRow({ user, row }: { user: SessionUser; row: PreferenceRowConfig }) {
  const router = useRouter();
  const [checked, setChecked] = useState(user[row.field]);
  const [saving, setSaving] = useState(false);

  async function onToggle() {
    const next = !checked;
    setChecked(next);
    setSaving(true);
    try {
      await api.me.update({ [row.field]: next });
      toast.success("Preference saved.");
      router.refresh();
    } catch (err) {
      setChecked(!next);
      toast.error(err instanceof ApiError ? err.message : "Failed to update preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <NotifRow
      label={row.label}
      description={row.description}
      checked={checked}
      onToggle={onToggle}
      disabled={saving}
    />
  );
}

function NotifRow({
  label,
  description,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} disabled={disabled} />
    </div>
  );
}

function DangerTab({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const isAdmin = user.role === ADMIN;

  async function handleDeactivate() {
    setDeactivating(true);
    try {
      await api.me.deactivate();
    } catch (err) {
      setDeactivating(false);
      setOpen(false);
      toast.error(err instanceof ApiError ? err.message : "Could not deactivate your account.");
      return;
    }
    // Account is now banned server-side; sign the current session out
    // immediately rather than waiting for the token to expire.
    await createSupabaseClient().auth.signOut();
    router.replace("/login?deactivated=1");
    router.refresh();
  }

  return (
    <Card className="rounded-t-none border-t-0 border-red-200">
      <CardHeader>
        <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
        <CardDescription>Irreversible actions. Proceed with caution.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Deactivate Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAdmin
                ? "Admin accounts cannot be self-deactivated. Ask another admin to do it."
                : "Deactivates your account and signs you out. Contact your administrator to reactivate."}
            </p>
          </div>
          {isAdmin ? (
            <Button variant="outline" size="sm" disabled>
              Deactivate
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
              Deactivate
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => !deactivating && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate your account?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll be signed out immediately and won&apos;t be able to log back in. Only a
              school administrator can reactivate your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={(e) => {
                e.preventDefault();
                handleDeactivate();
              }}
              disabled={deactivating}
            >
              {deactivating && <Loader2 size={14} className="mr-2 animate-spin" />}
              Deactivate account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
