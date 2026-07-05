"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Users,
  UserCheck,
  UserMinus,
  Briefcase,
  Eye,
  UserX,
  Plus,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
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
import { ApiError } from "@/lib/api/browser";
import {
  useStaffList,
  useStaffMutations,
  type StaffListResponse,
  type StaffRow,
} from "@/features/staff/hooks/use-staff";
import type { SchoolClass } from "@/features/classes/types";
import { cn } from "@/lib/utils";

type SystemRole = "Admin" | "DeputyHead" | "Teacher" | "Accountant";

const ROLE_PILL: Record<SystemRole, string> = {
  Admin: "bg-purple-100 text-purple-700",
  DeputyHead: "bg-blue-100 text-blue-700",
  Teacher: "bg-orange-100 text-accent-orange",
  Accountant: "bg-emerald-100 text-emerald-700",
};

const ROLE_LABEL: Record<SystemRole, string> = {
  Admin: "Admin",
  DeputyHead: "Deputy Head",
  Teacher: "Teacher",
  Accountant: "Accountant",
};

const ROLE_AVATAR: Record<SystemRole, string> = {
  Admin: "from-purple-400 to-purple-600",
  DeputyHead: "from-blue-400 to-blue-600",
  Teacher: "from-orange-400 to-accent-orange",
  Accountant: "from-emerald-400 to-emerald-600",
};

type RoleFilter = SystemRole | "All";

interface StaffTableProps {
  initialData: StaffListResponse;
  classes?: SchoolClass[];
  listHref: string;
}

export default function StaffTable({ initialData, classes, listHref }: StaffTableProps) {
  const router = useRouter();
  // FastAPI is now the source of truth. TanStack handles cache + invalidation;
  // mutations call `onSuccess` → invalidate, which triggers a refetch.
  const { data } = useStaffList({}, { initialData });
  const mutations = useStaffMutations();
  const isPending =
    mutations.activate.isPending || mutations.deactivate.isPending;
  const [deactivateTarget, setDeactivateTarget] = useState<StaffRow | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");

  const classTeacherMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of classes ?? []) {
      for (const t of c.classTeachers) {
        (map[t.staffId] ??= []).push(c.name);
      }
    }
    return map;
  }, [classes]);

  const staff = data?.items ?? [];
  const total = staff.length;
  const activeCount = staff.filter((s) => s.isActive).length;
  const inactiveCount = staff.filter((s) => !s.isActive).length;
  const distinctRoles = new Set(staff.map((s) => s.systemRole).filter(Boolean)).size;

  const displayedStaff = staff.filter((s) => {
    const roleMatch = roleFilter === "All" || s.systemRole === roleFilter;
    const statusMatch =
      statusFilter === "All" ||
      (statusFilter === "Active" ? s.isActive : !s.isActive);
    return roleMatch && statusMatch;
  });

  function doDeactivate(id: string) {
    mutations.deactivate.mutate(id, {
      onSuccess: () => toast.success("Staff member deactivated."),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Deactivation failed."),
    });
  }

  function doReactivate(id: string) {
    mutations.activate.mutate(id, {
      onSuccess: () => toast.success("Staff member reactivated."),
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Reactivation failed."),
    });
  }

  const columns: ColumnDef<StaffRow>[] = [
    {
      id: "staff",
      header: "Staff",
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
              gradient={ROLE_AVATAR[(s.systemRole ?? "Teacher") as SystemRole]}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {s.firstName} {s.lastName}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">{s.slug}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "systemRole",
      header: "Role",
      cell: ({ row }) => {
        const role = (row.original.systemRole ?? "Teacher") as SystemRole;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              ROLE_PILL[role]
            )}
          >
            {ROLE_LABEL[role]}
          </span>
        );
      },
    },
    {
      accessorKey: "division",
      header: "Division",
      cell: ({ row }) => {
        const div = row.original.division;
        return (
          <span className="text-sm text-muted-foreground">
            {div ?? "—"}
          </span>
        );
      },
    },
    {
      id: "classes",
      header: "Classes",
      cell: ({ row }) => {
        const classNames = classTeacherMap[row.original.id] ?? [];
        if (classNames.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {classNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {name}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "rank",
      header: "Rank",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.rank}</span>
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`${listHref}/${s.id}`}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="View"
            >
              <Eye size={13} />
            </Link>
            <button
              onClick={() => {
                if (s.isActive) {
                  setDeactivateTarget(s);
                } else {
                  doReactivate(s.id);
                }
              }}
              disabled={isPending}
              title={s.isActive ? "Deactivate" : "Reactivate"}
              className={cn(
                "p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40",
                s.isActive
                  ? "text-muted-foreground hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                  : "text-muted-foreground hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-950/30"
              )}
            >
              {s.isActive ? <UserX size={13} /> : <UserCheck size={13} />}
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
          <h1 className="text-xl font-bold">Staff</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage staff records and system access.
          </p>
        </div>
        <Link
          href={`${listHref}/new`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 text-white px-5 py-2 text-sm font-medium hover:bg-slate-900 active:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
        >
          <Plus size={14} /> Register staff
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Staff"
          value={total}
          icon={<Users size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Active"
          value={activeCount}
          icon={<UserCheck size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Inactive"
          value={inactiveCount}
          icon={<UserMinus size={17} className="text-gray-500" />}
          iconBg="bg-gray-100 dark:bg-gray-800"
        />
        <StatCard
          label="Roles"
          value={distinctRoles}
          icon={<Briefcase size={17} className="text-purple-600" />}
          iconBg="bg-purple-50 dark:bg-purple-950/40"
        />
      </div>

      {/* Table card */}
      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["All", "Admin", "DeputyHead", "Teacher"] as const).map((r) => (
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
                {r === "All" ? "All roles" : ROLE_LABEL[r]}
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
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
                {s === "All" ? "All status" : s}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={displayedStaff}
          onRowClick={(s) => router.push(`${listHref}/${s.id}`)}
          searchKey="name"
          searchPlaceholder="Search by name, role, ID…"
        />
      </div>

      {/* Deactivate confirmation */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Deactivate {deactivateTarget?.firstName} {deactivateTarget?.lastName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will be marked inactive. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deactivateTarget) {
                  doDeactivate(deactivateTarget.id);
                  setDeactivateTarget(null);
                }
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
