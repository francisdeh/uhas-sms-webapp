"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserX, UserCheck, Plus, Loader2, Pencil, Users, Activity, UserCog, ShieldCheck, Mail, KeyRound } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { useStaffList } from "@/features/staff/hooks/use-staff";
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
import { api, ApiError } from "@/lib/api/browser";
import type { ManagedUser } from "@/features/auth/types";
import { USER_ROLES, ROLE_LABELS, ADMIN, PARENT, TEACHER, type UserRole } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const ROLES = USER_ROLES;

const ROLE_PILL: Record<UserRole, string> = {
  Admin: "bg-slate-800 text-white dark:bg-slate-600",
  DeputyHead: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Teacher: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Parent: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Accountant: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

const AVATAR_GRADIENT: Record<UserRole, string> = {
  Admin: "from-slate-600 to-slate-800",
  DeputyHead: "from-blue-400 to-blue-600",
  Teacher: "from-emerald-400 to-emerald-600",
  Parent: "from-amber-400 to-amber-600",
  Accountant: "from-teal-400 to-teal-600",
};

type FormState = {
  displayName: string;
  email: string;
  phone: string;
  role: UserRole;
  linkedId: string;
};

const EMPTY_FORM: FormState = {
  displayName: "",
  email: "",
  phone: "",
  role: TEACHER,
  linkedId: "",
};

function StatCard({
  label,
  value,
  icon,
  iconBg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", iconBg)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function UsersTable({ initialUsers }: { initialUsers: ManagedUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<"form" | "invite">("form");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null);
  const [resetMfaTarget, setResetMfaTarget] = useState<ManagedUser | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "All">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");

  const isParentRole = form.role === PARENT;
  const { data: staffData, isLoading: staffLoading } = useStaffList(
    { activeOnly: true, size: 200 },
    { enabled: dialogOpen && !isParentRole },
  );
  const { data: guardiansData, isLoading: guardiansLoading } = useQuery({
    queryKey: ["guardians", "list", { size: 200 }],
    queryFn: () => api.guardians.list({ size: 200 }),
    enabled: dialogOpen && isParentRole,
  });
  // Staff/guardians who already have an account shouldn't be offered
  // again in the "New account" dropdown — picking them would either
  // 409 against their existing account or silently create a second,
  // divergent one for the same person.
  const alreadyLinkedIds = new Set(users.map((u) => u.linkedId).filter(Boolean));
  const linkOptions = isParentRole
    ? (guardiansData?.items ?? [])
        .filter((g) => editingUser?.linkedId === g.id || !alreadyLinkedIds.has(g.id))
        .map((g) => ({
          id: g.id,
          label: `${g.firstName} ${g.lastName} (${g.slug})`,
          email: g.email ?? "",
          phone: g.phone ?? "",
        }))
    : (staffData?.items ?? [])
        .filter((s) => editingUser?.linkedId === s.id || !alreadyLinkedIds.has(s.id))
        .map((s) => ({
          id: s.id,
          label: `${s.firstName} ${s.lastName} (${s.slug})`,
          email: s.email ?? "",
          phone: s.phone ?? "",
        }));
  const linkOptionsLoading = isParentRole ? guardiansLoading : staffLoading;
  // Base UI's <Select.Value> only resolves a label from <Select.Item>s
  // that have actually mounted (i.e. the dropdown has been opened at
  // least once) — a value pre-filled via openEdit() on a never-opened
  // dropdown falls back to showing the raw UUID. An explicit children
  // render-prop sidesteps that.
  function linkOptionLabel(id: string | undefined): string {
    if (!id) return "";
    return linkOptions.find((opt) => opt.id === id)?.label ?? "";
  }

  const toggleMutation = useMutation({
    mutationFn: ({ uid, isActive }: { uid: string; isActive: boolean }) =>
      isActive ? api.users.deactivate(uid) : api.users.activate(uid),
    onSuccess: (_data, { uid, isActive }) => {
      toast.success(isActive ? "User deactivated." : "User reactivated.");
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, isActive: !isActive } : u)));
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update user.");
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      api.users.create({
        email: payload.email || null,
        phone: payload.phone || null,
        displayName: payload.displayName,
        role: payload.role,
        linkedId: payload.linkedId || null,
      }),
    onSuccess: (created, payload) => {
      setUsers((prev) => [
        ...prev,
        {
          uid: created.id,
          email: created.email ?? null,
          displayName: created.displayName,
          role: created.role as UserRole,
          linkedId: created.linkedId ?? "",
          slug: created.slug ?? null,
          isActive: created.isActive,
          photoUrl: null,
        },
      ]);
      setInviteName(payload.displayName);
      setInviteEmail(payload.email);
      setForm(EMPTY_FORM);
      setDialogView("invite");
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to create user.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ uid, payload }: { uid: string; payload: FormState }) =>
      api.users.update(uid, { displayName: payload.displayName }),
    onSuccess: (_data, { uid, payload }) => {
      toast.success("Account updated.");
      // Only displayName is actually sent/persisted (see mutationFn) —
      // role and linkedId are disabled inputs while editing, so they
      // always equal the existing values here regardless.
      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, displayName: payload.displayName } : u)),
      );
      setDialogOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to update user.");
    },
  });

  const resetMfaMutation = useMutation({
    mutationFn: (uid: string) => api.users.resetMfa(uid),
    onSuccess: (result) => {
      setResetMfaTarget(null);
      toast.success(
        result.factorsRemoved > 0
          ? "2FA reset. The user has been signed out and can re-enrol after logging in."
          : "This user had no 2FA enabled.",
      );
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Failed to reset 2FA.");
    },
  });

  const isPending =
    toggleMutation.isPending ||
    createMutation.isPending ||
    updateMutation.isPending ||
    resetMfaMutation.isPending;

  const total = users.length;
  const active = users.filter((u) => u.isActive).length;
  const staff = users.filter((u) => u.role !== PARENT).length;
  const admins = users.filter((u) => u.role === ADMIN).length;

  const displayedUsers = users.filter((u) => {
    const roleMatch = roleFilter === "All" || u.role === roleFilter;
    const statusMatch = statusFilter === "All" || (statusFilter === "Active" ? u.isActive : !u.isActive);
    return roleMatch && statusMatch;
  });

  function openCreate() {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setDialogView("form");
    setDialogOpen(true);
  }

  function openEdit(user: ManagedUser) {
    setEditingUser(user);
    setForm({
      displayName: user.displayName,
      email: user.email ?? "",
      phone: "",
      role: user.role,
      linkedId: user.linkedId,
    });
    setDialogView("form");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function confirmDeactivate(user: ManagedUser) {
    if (user.isActive) {
      setDeactivateTarget(user);
    } else {
      doToggle(user.uid, false);
    }
  }

  function doToggle(uid: string, isActive: boolean) {
    toggleMutation.mutate({ uid, isActive });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      updateMutation.mutate({ uid: editingUser.uid, payload: form });
      return;
    }
    if (isParentRole && !form.email.trim() && !form.phone.trim()) {
      toast.error("A parent login needs at least an email or a phone.");
      return;
    }
    createMutation.mutate(form);
  }

  const columns: ColumnDef<ManagedUser>[] = [
    {
      id: "user",
      header: "User",
      accessorFn: (row) => row.displayName,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-3 py-0.5">
            <div className="relative flex-shrink-0">
              <UserAvatar
                photoUrl={u.photoUrl}
                firstName={u.displayName?.split(" ")[0] ?? "?"}
                lastName={u.displayName?.split(" ").slice(1).join(" ") ?? ""}
                size="sm"
                gradient={AVATAR_GRADIENT[u.role]}
              />
              <span className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                u.isActive ? "bg-green-500" : "bg-gray-400"
              )} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{u.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {u.email ?? "Phone login"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "slug",
      header: "Staff ID",
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.slug || "—"}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", ROLE_PILL[row.original.role])}>
          {ROLE_LABELS[row.original.role]}
        </span>
      ),
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => {
        const active = row.original.isActive;
        return (
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", active ? "bg-green-500" : "bg-gray-400")} />
            <span className={cn("text-xs", active ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
              {active ? "Active" : "Inactive"}
            </span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => openEdit(u)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Edit"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setResetMfaTarget(u)}
              disabled={isPending}
              title="Reset 2FA"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/30 transition-colors cursor-pointer disabled:opacity-40"
            >
              <KeyRound size={13} />
            </button>
            <button
              onClick={() => confirmDeactivate(u)}
              disabled={isPending}
              title={u.isActive ? "Deactivate" : "Reactivate"}
              className={cn(
                "p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40",
                u.isActive
                  ? "text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  : "text-muted-foreground hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/30"
              )}
            >
              {u.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">User Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage system accounts and access roles.</p>
        </div>
        <Button variant="brand" onClick={openCreate}>
          <Plus size={14} /> New account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Accounts"
          value={total}
          icon={<Users size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Active"
          value={active}
          icon={<Activity size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Staff"
          value={staff}
          icon={<UserCog size={17} className="text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="Admins"
          value={admins}
          icon={<ShieldCheck size={17} className="text-violet-600" />}
          iconBg="bg-violet-50 dark:bg-violet-950/40"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["All", ...ROLES] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                  roleFilter === r
                    ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
                )}
              >
                {r === "All" ? "All roles" : ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border/60 hidden sm:block" />

          <div className="flex items-center gap-1.5">
            {(["All", "Active", "Inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                  statusFilter === s
                    ? s === "Active"
                      ? "bg-green-600 text-white border-green-600"
                      : s === "Inactive"
                      ? "bg-gray-500 text-white border-gray-500"
                      : "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                    : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
                )}
              >
                {s !== "All" && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", s === "Active" ? "bg-white" : "bg-white")} />
                )}
                {s === "All" ? "All status" : s}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={displayedUsers}
          onRowClick={openEdit}
          searchKey="name"
          searchPlaceholder="Search by name, email, role…"
        />
      </div>

      {/* Deactivate Confirmation */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate account?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.displayName}</strong> will lose access immediately. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              onClick={() => {
                if (deactivateTarget) {
                  doToggle(deactivateTarget.uid, true);
                  setDeactivateTarget(null);
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset 2FA Confirmation */}
      <AlertDialog
        open={!!resetMfaTarget}
        onOpenChange={(open) => {
          if (!open && !resetMfaMutation.isPending) setResetMfaTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset two-factor authentication?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears <strong>{resetMfaTarget?.displayName}</strong>&apos;s authenticator so they
              can sign in with just their password (use this if they&apos;ve lost their device). It
              signs them out of all sessions; they can set up 2FA again afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetMfaMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetMfaMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (resetMfaTarget) resetMfaMutation.mutate(resetMfaTarget.uid);
              }}
            >
              {resetMfaMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
              Reset 2FA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Dialog — form view or invite-link view */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          {dialogView === "form" ? (
            <>
              <DialogHeader>
                <DialogTitle>{editingUser ? "Edit account" : "New account"}</DialogTitle>
                <DialogDescription>
                  {editingUser
                    ? "Update the details for this account."
                    : "Create a new system account. An invite email will be sent."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <FieldGroup className="gap-3 py-1">
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>Role</FieldLabel>
                      <select
                        value={form.role}
                        disabled={!!editingUser}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...EMPTY_FORM,
                            role: e.target.value as UserRole,
                          }))
                        }
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel>{isParentRole ? "Guardian" : "Staff"}</FieldLabel>
                      <Select
                        value={form.linkedId}
                        onValueChange={(v) => {
                          const selected = linkOptions.find((opt) => opt.id === v);
                          setForm((f) => ({
                            ...f,
                            linkedId: v || "",
                            displayName: selected
                              ? selected.label.replace(/\s*\([^)]*\)$/, "")
                              : f.displayName,
                            email: selected ? selected.email : f.email,
                            phone: selected ? selected.phone : f.phone,
                          }));
                        }}
                        disabled={linkOptionsLoading || !!editingUser}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              linkOptionsLoading
                                ? "Loading…"
                                : `Select a ${isParentRole ? "guardian" : "staff member"}`
                            }
                          >
                            {(value: string) => linkOptionLabel(value)}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {linkOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {!editingUser && (
                    <p className="text-xs text-muted-foreground -mt-1">
                      Only {isParentRole ? "guardians" : "staff"} without an existing account are
                      listed. Picking one fills in their name, email, and phone below from their
                      record — you can still edit them before creating the account.
                    </p>
                  )}
                  <Field>
                    <FieldLabel>Full name</FieldLabel>
                    <Input
                      required
                      placeholder="Selorm Tornu"
                      value={form.displayName}
                      onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    />
                  </Field>
                  {!editingUser && (
                    <Field>
                      <FieldLabel>
                        Email{isParentRole && <span className="text-muted-foreground"> (optional)</span>}
                      </FieldLabel>
                      <Input
                        required={!isParentRole}
                        type="email"
                        placeholder="k.boateng@uhas.edu.gh"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </Field>
                  )}
                  {!editingUser && isParentRole && (
                    <Field>
                      <FieldLabel>
                        Phone <span className="text-muted-foreground">(for SMS-OTP login)</span>
                      </FieldLabel>
                      <Input
                        type="tel"
                        placeholder="+233 24 000 0000"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        A parent can sign in by phone (OTP) and/or email. Provide at least one.
                      </p>
                    </Field>
                  )}
                  {editingUser && (
                    <p className="text-xs text-muted-foreground -mt-1">
                      Role and linked staff/guardian can&apos;t be changed here — deactivate and
                      recreate the account to change either.
                    </p>
                  )}
                </FieldGroup>
                <DialogFooter className="mt-2">
                  <Button type="submit" variant="brand" disabled={isPending}>
                    {isPending && <Loader2 size={13} className="animate-spin" />}
                    {editingUser ? "Save changes" : "Create account"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-50 dark:bg-green-950/40 mx-auto mb-1">
                  <Mail size={20} className="text-green-600" />
                </div>
                <DialogTitle className="text-center">Account created</DialogTitle>
                <DialogDescription className="text-center">
                  {inviteEmail ? (
                    <>
                      We&apos;ve emailed <strong>{inviteName}</strong> an invite at{" "}
                      <strong>{inviteEmail}</strong> to set their password and log in.
                    </>
                  ) : (
                    <>
                      <strong>{inviteName}</strong> can now sign in with their phone number
                      using a one-time code (OTP).
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <Button variant="brand" className="w-full" onClick={closeDialog}>
                Done
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
