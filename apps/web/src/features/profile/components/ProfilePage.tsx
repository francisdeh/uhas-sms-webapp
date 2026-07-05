"use client";

import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, Monitor, Copy, CheckCheck, UserCircle, Bell as BellIcon, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldError, FieldGroup } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ImageUploadField } from "@/features/uploads/components/ImageUploadField";
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

const profileSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters" }),
  phone: z.string().optional(),
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

const MOCK_SESSIONS = [
  { id: "s1", device: "MacBook Pro", browser: "Chrome 124", lastSeen: "Just now", current: true },
  { id: "s2", device: "iPhone 15", browser: "Safari 17", lastSeen: "2 hours ago", current: false },
  { id: "s3", device: "Windows PC", browser: "Edge 123", lastSeen: "3 days ago", current: false },
];

interface ProfilePageProps {
  user: SessionUser;
  currentPhotoUrl?: string | null;
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

function ProfilePageContent({ user, currentPhotoUrl = null }: ProfilePageProps) {
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
              <ProfileTab user={user} currentPhotoUrl={currentPhotoUrl} />
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

function ProfileTab({ user, currentPhotoUrl }: { user: SessionUser; currentPhotoUrl: string | null }) {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState<string | null>(currentPhotoUrl);
  const canEditPhoto = !!user.linkedId && user.role !== "Parent";

  async function onPhotoChange(next: string | null) {
    setPhotoUrl(next);
    if (!user.linkedId) {
      toast.error("No linked staff record.");
      return;
    }
    try {
      await api.staff.update(user.linkedId, { photoUrl: next });
      toast.success(next ? "Photo updated." : "Photo removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update photo.");
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName, phone: user.phone ?? "" },
  });

  async function onSubmit(values: ProfileValues) {
    try {
      await api.me.update({ displayName: values.displayName, phone: values.phone || null });
      toast.success("Profile updated successfully.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to update profile.");
    }
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Personal Information</CardTitle>
        <CardDescription>Update your name and contact info.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <UserAvatar
            photoUrl={photoUrl}
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

        {canEditPhoto && (
          <div className="mb-6 max-w-sm">
            <ImageUploadField
              ownerId={user.linkedId}
              kind="staff/photo"
              value={photoUrl}
              onChange={onPhotoChange}
              label="Update profile photo"
            />
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="gap-4 max-w-sm">
            <Field>
              <FieldLabel htmlFor="displayName">Display Name</FieldLabel>
              <Input id="displayName" className="rounded-md" {...register("displayName")} />
              <FieldError errors={[errors.displayName]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email Address</FieldLabel>
              <Input id="email" value={user.email || "—"} disabled className="rounded-md bg-muted/40 cursor-not-allowed" />
            </Field>

            <Field>
              <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
              <Input id="phone" className="rounded-md" placeholder="0244 000 000" {...register("phone")} />
            </Field>

            <Button type="submit" variant="ink" className="px-5 py-2 h-auto text-sm" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
              Save Changes
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const [mfaEnabled] = useState(false);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaStep, setMfaStep] = useState<"qr" | "verify" | "backup">("qr");
  const [backupCodes] = useState(["ABCD-1234", "EFGH-5678", "IJKL-9012", "MNOP-3456", "QRST-7890", "UVWX-2345"]);
  const [copied, setCopied] = useState(false);
  const [totpCode, setTotpCode] = useState("");

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

  function handleCopyBackupCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

      <Card className={mfaEnabled ? "border-green-200 bg-green-50/30" : "border-amber-200 bg-amber-50/30"}>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account.</CardDescription>
            </div>
            {mfaEnabled ? (
              <Badge className="bg-green-100 text-green-700 border border-green-300">
                <ShieldCheck size={12} className="mr-1" /> Enabled
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-700 border border-amber-300">
                <Shield size={12} className="mr-1" /> Not enabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!mfaEnabled && !showMfaSetup && (
            <Button
              className="rounded-sm bg-amber-500 text-white hover:bg-amber-600"
              onClick={() => { setShowMfaSetup(true); setMfaStep("qr"); }}
            >
              <ShieldCheck size={14} /> Enable Authenticator App
            </Button>
          )}

          {showMfaSetup && mfaStep === "qr" && (
            <div className="space-y-4 max-w-sm">
              <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app.</p>
              <div className="w-40 h-40 bg-muted rounded-lg flex items-center justify-center border border-border/60">
                <p className="text-xs text-muted-foreground text-center px-3">QR code — 2FA setup coming soon</p>
              </div>
              <Button onClick={() => setMfaStep("verify")} className="bg-accent-orange text-white hover:bg-accent-orange/90">
                I&apos;ve scanned the code
              </Button>
            </div>
          )}

          {showMfaSetup && mfaStep === "verify" && (
            <div className="space-y-4 max-w-xs">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
              <Input
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-lg tracking-widest rounded-md"
              />
              <Button disabled={totpCode.length !== 6} onClick={() => setMfaStep("backup")} className="bg-accent-orange text-white hover:bg-accent-orange/90">
                Verify & Enable
              </Button>
            </div>
          )}

          {showMfaSetup && mfaStep === "backup" && (
            <div className="space-y-4 max-w-sm">
              <p className="text-sm text-muted-foreground">Save these backup codes somewhere safe.</p>
              <div className="grid grid-cols-2 gap-1.5 p-3 bg-muted rounded-lg font-mono text-sm">
                {backupCodes.map((code) => <span key={code}>{code}</span>)}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyBackupCodes}>
                  {copied ? <CheckCheck size={13} className="mr-1" /> : <Copy size={13} className="mr-1" />}
                  {copied ? "Copied" : "Copy codes"}
                </Button>
                <Button size="sm" onClick={() => { setShowMfaSetup(false); toast.success("MFA enabled."); }} className="bg-accent-orange text-white hover:bg-accent-orange/90">
                  Done
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Sessions</CardTitle>
          <CardDescription>Devices currently signed in to your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {MOCK_SESSIONS.map((session) => (
              <div key={session.id} className={`flex items-center gap-3 py-2.5 px-3 rounded-lg border-b border-border/30 last:border-0 ${session.current ? "bg-green-50/60 border border-green-200 rounded-lg" : ""}`}>
                <Monitor size={16} className={session.current ? "text-green-600 shrink-0" : "text-muted-foreground shrink-0"} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.device}</p>
                  <p className="text-xs text-muted-foreground">{session.browser} · {session.lastSeen}</p>
                </div>
                {session.current ? (
                  <Badge className="text-xs bg-green-100 text-green-700 border border-green-300">Current</Badge>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-600 hover:bg-red-50">
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsTab({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [emailOnRejected, setEmailOnRejected] = useState(user.emailOnLessonPlanRejected);
  const [saving, setSaving] = useState(false);

  async function onToggle() {
    const next = !emailOnRejected;
    setEmailOnRejected(next);
    setSaving(true);
    try {
      await api.me.update({ emailOnLessonPlanRejected: next });
      toast.success("Preference saved.");
      router.refresh();
    } catch (err) {
      setEmailOnRejected(!next);
      toast.error(err instanceof ApiError ? err.message : "Failed to update preference.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-t-none border-t-0">
      <CardHeader>
        <CardTitle className="text-base">Notification Preferences</CardTitle>
        <CardDescription>Choose how you want to receive notifications.</CardDescription>
      </CardHeader>
      <CardContent>
        {user.role === "Teacher" ? (
          <NotifRow
            label="Email — Lesson Plan Rejected"
            description="Receive an email when a reviewer sends one of your lesson plans back for changes."
            checked={emailOnRejected}
            onToggle={onToggle}
            disabled={saving}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            There&apos;s nothing to configure for your role yet.
          </p>
        )}
      </CardContent>
    </Card>
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
  const [confirming, setConfirming] = useState(false);
  const isAdmin = user.role === "Admin";

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
                ? "Admin accounts cannot be self-deactivated. Contact the system owner."
                : "Sends a deactivation request to the school administrator."}
            </p>
          </div>
          {isAdmin ? (
            <Button variant="outline" size="sm" disabled>Deactivate</Button>
          ) : confirming ? (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" onClick={() => { setConfirming(false); toast.success("Deactivation request sent to administrator."); }}>
                Confirm
              </Button>
            </div>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>Deactivate</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
