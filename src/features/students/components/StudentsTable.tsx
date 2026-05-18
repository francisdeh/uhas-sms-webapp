"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  UserX,
  UserCheck,
  Eye,
  Plus,
  Users,
  UserMinus,
  BarChart3,
  GraduationCap,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  deactivateStudentAction,
  reactivateStudentAction,
} from "@/features/students/actions";
import type { Student } from "@/features/students/types";
import { cn } from "@/lib/utils";

const DIVISION_AVATAR: Record<Student["division"], string> = {
  KG: "from-purple-400 to-purple-600",
  "Lower Primary": "from-sky-400 to-sky-600",
  "Upper Primary": "from-blue-400 to-blue-600",
  JHS: "from-orange-400 to-accent-orange",
};

const DIVISION_PILL: Record<Student["division"], string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

function studentInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function formatDob(dob: string) {
  return new Date(dob).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface StudentsTableProps {
  initialStudents: Student[];
  division?: string;
  listHref: string;
}

export default function StudentsTable({
  initialStudents,
  division,
  listHref,
}: StudentsTableProps) {
  const [students, setStudents] = useState(initialStudents);
  const [isPending, startTransition] = useTransition();
  const [deactivateTarget, setDeactivateTarget] = useState<Student | null>(null);
  const [divisionFilter, setDivisionFilter] = useState<Student["division"] | "All">("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Inactive">("All");

  const total = students.length;
  const activeCount = students.filter((s) => s.isActive).length;
  const inactiveCount = students.filter((s) => !s.isActive).length;
  const divisionCount = division
    ? students.filter((s) => s.division === division).length
    : divisionFilter !== "All"
      ? students.filter((s) => s.division === divisionFilter).length
      : total;

  const divisionCountLabel = division
    ? `${division} Students`
    : divisionFilter !== "All"
      ? `${divisionFilter} Students`
      : "All Divisions";

  const displayedStudents = students.filter((s) => {
    const divMatch =
      division
        ? s.division === division
        : divisionFilter === "All" || s.division === divisionFilter;
    const statusMatch =
      statusFilter === "All" ||
      (statusFilter === "Active" ? s.isActive : !s.isActive);
    return divMatch && statusMatch;
  });

  function doDeactivate(id: string) {
    startTransition(async () => {
      const result = await deactivateStudentAction(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Student deactivated.");
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: false } : s))
      );
    });
  }

  function doReactivate(id: string) {
    startTransition(async () => {
      const result = await reactivateStudentAction(id);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Student reactivated.");
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: true } : s))
      );
    });
  }

  const columns: ColumnDef<Student>[] = [
    {
      id: "student",
      header: "Student",
      accessorFn: (row) => `${row.firstName} ${row.lastName}`,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3 py-0.5">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback
                className={cn(
                  "bg-gradient-to-br text-white text-[11px] font-semibold",
                  DIVISION_AVATAR[s.division]
                )}
              >
                {studentInitials(s.firstName, s.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {s.firstName} {s.lastName}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">{s.id}</p>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "className",
      header: "Class",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.className}</span>
      ),
    },
    {
      accessorKey: "division",
      header: "Division",
      cell: ({ row }) => {
        const div = row.original.division;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              DIVISION_PILL[div]
            )}
          >
            {div}
          </span>
        );
      },
    },
    {
      accessorKey: "dob",
      header: "Date of Birth",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDob(row.original.dob)}
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
          <div className="flex items-center justify-end gap-0.5">
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
          <h1 className="text-xl font-bold">Students</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage student records and enrolment status.
          </p>
        </div>
        <Link
          href={`${listHref}/new`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 text-white px-5 py-2 text-sm font-medium hover:bg-slate-900 active:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
        >
          <Plus size={14} /> Register student
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Students"
          value={total}
          icon={<Users size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Active"
          value={activeCount}
          icon={<GraduationCap size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Inactive"
          value={inactiveCount}
          icon={<UserMinus size={17} className="text-gray-500" />}
          iconBg="bg-gray-100 dark:bg-gray-800"
        />
        <StatCard
          label={divisionCountLabel}
          value={divisionCount}
          icon={<BarChart3 size={17} className="text-accent-orange" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
        />
      </div>

      {/* Table card */}
      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-4">
          {!division && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["All", "KG", "Lower Primary", "Upper Primary", "JHS"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDivisionFilter(d)}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                    divisionFilter === d
                      ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                      : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground"
                  )}
                >
                  {d === "All" ? "All divisions" : d}
                </button>
              ))}
            </div>
          )}

          {!division && (
            <div className="w-px h-4 bg-border/60 hidden sm:block" />
          )}

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
          data={displayedStudents}
          searchKey="name"
          searchPlaceholder="Search by name, class, ID…"
        />
      </div>

      {/* Deactivate confirmation */}
      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate student?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>
                {deactivateTarget?.firstName} {deactivateTarget?.lastName}
              </strong>{" "}
              will be marked inactive. You can reactivate at any time.
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
