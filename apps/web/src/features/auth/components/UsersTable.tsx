"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { UserX, UserCheck, Plus, Loader2, Pencil, Users, Activity, UserCog, ShieldCheck, Copy, Check, Link } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { DataTable } from "@/components/ui/data-table";
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
import {
  deactivateUserAction,
  reactivateUserAction,
  createUserAction,
  updateUserAction,
} from "@/features/auth/actions/manage-users";
import type { ManagedUser } from "@/features/auth/actions/manage-users";
import { USER_ROLES, type UserRole } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const ROLES = USER_ROLES;

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: "Admin",
  DeputyHead: "Deputy Head",
  Teacher: "Teacher",
  Parent: "Parent",
};

const ROLE_PILL: Record<UserRole, string> = {
  Admin: "bg-slate-800 text-white dark:bg-slate-600",
  DeputyHead: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Teacher: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Parent: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const AVATAR_GRADIENT: Record<UserRole, string> = {
  Admin: "from-slate-600 to-slate-800",
  DeputyHead: "from-blue-400 to-blue-600",
  Teacher: "from-emerald-400 to-emerald-600",
  Parent: "from-amber-400 to-amber-600",
};

type FormState = {
  displayName: string;
  email: string;
  role: UserRole;
  linkedId: string;
};

const EMPTY_FORM: FormState = { displayName: "", email: "", role: "Teacher", linkedId: "" };

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
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<"form" | "invite">("form");
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState("");
  const [copied, setCopied] = useState(false);
  const [roleFilter, setRoleFilter] = useState<UserRole | "All">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");

  const total = users.length;
  const active = users.filter((u) => u.isActive).length;
  const staff = users.filter((u) => u.role !== "Parent").length;
  const admins = users.filter((u) => u.role === "Admin").length;

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
    setForm({ displayName: user.displayName, email: user.email, role: user.role, linkedId: user.linkedId });
    setDialogView("form");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setCopied(false);
    setInviteLink(null);
  }

  function confirmDeactivate(user: ManagedUser) {
    if (user.isActive) {
      setDeactivateTarget(user);
    } else {
      doToggle(user.uid, false);
    }
  }

  function doToggle(uid: string, isActive: boolean) {
    startTransition(async () => {
      const result = isActive ? await deactivateUserAction(uid) : await reactivateUserAction(uid);
      if (!result.success) { toast.error(result.error); return; }
      toast.success(isActive ? "User deactivated." : "User reactivated.");
      setUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, isActive: !isActive } : u));
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingUser) {
      startTransition(async () => {
        const result = await updateUserAction(editingUser.uid, { displayName: form.displayName, role: form.role, linkedId: form.linkedId });
        if (!result.success) { toast.error(result.error); return; }
        toast.success("Account updated.");
        setUsers((prev) => prev.map((u) => u.uid === editingUser.uid ? { ...u, displayName: form.displayName, role: form.role, linkedId: form.linkedId } : u));
        setDialogOpen(false);
      });
    } else {
      startTransition(async () => {
        const result = await createUserAction(form);
        if (!result.success) { toast.error(result.error); return; }
        setUsers((prev) => [...prev, { uid: result.uid!, ...form, isActive: true, photoUrl: null }]);
        setInviteName(form.displayName);
        setInviteLink(result.inviteLink ?? null);
        setForm(EMPTY_FORM);
        setDialogView("invite");
      });
    }
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
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "linkedId",
      header: "Staff ID",
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.linkedId || "—"}
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
          <div className="flex items-center justify-end gap-0.5">
            <button
              onClick={() => openEdit(u)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Edit"
            >
              <Pencil size={13} />
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
        <Button variant="ink" className="px-5 py-2 h-auto text-sm" onClick={openCreate}>
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
              className="bg-destructive text-white hover:bg-destructive/90"
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
                    : "Create a new system account. An invite link will be generated."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <FieldGroup className="gap-3 py-1">
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
                      <FieldLabel>Email</FieldLabel>
                      <Input
                        required
                        type="email"
                        placeholder="k.boateng@uhas.edu.gh"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <FieldLabel>Role</FieldLabel>
                      <select
                        value={form.role}
                        onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition-colors"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel>Staff ID</FieldLabel>
                      <Input
                        placeholder="STAFF-042"
                        value={form.linkedId}
                        onChange={(e) => setForm((f) => ({ ...f, linkedId: e.target.value }))}
                      />
                    </Field>
                  </div>
                </FieldGroup>
                <DialogFooter className="mt-2">
                  <Button type="submit" variant="ink" className="px-5 py-2 h-auto text-sm" disabled={isPending}>
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
                  <Link size={20} className="text-green-600" />
                </div>
                <DialogTitle className="text-center">Account created</DialogTitle>
                <DialogDescription className="text-center">
                  Share this one-time invite link with <strong>{inviteName}</strong> so they can set their password and log in.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs font-mono break-all text-muted-foreground">
                {inviteLink}
              </div>
              <Button
                variant="ink"
                className="w-full py-2 h-auto text-sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink ?? "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center -mt-1">
                This link expires after use.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
