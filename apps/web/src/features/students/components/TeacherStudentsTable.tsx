"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, Users, GraduationCap, School } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { UserAvatar } from "@/components/ui/user-avatar";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import type { Student } from "@/features/students/types";
import type { Division } from "@/features/auth/types";
import { cn } from "@/lib/utils";

const DIVISION_AVATAR: Record<Division, string> = {
  KG: "from-purple-400 to-purple-600",
  "Lower Primary": "from-sky-400 to-sky-600",
  "Upper Primary": "from-blue-400 to-blue-600",
  JHS: "from-orange-400 to-accent-orange",
};

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

interface TeacherStudentsTableProps {
  students: Student[];
  listHref: string;
}

export function TeacherStudentsTable({ students, listHref }: TeacherStudentsTableProps) {
  const router = useRouter();

  const total = students.length;
  const activeCount = students.filter((s) => s.isActive).length;
  const classCount = new Set(students.map((s) => s.classId)).size;

  const columns = useMemo<ColumnDef<Student>[]>(
    () => [
      {
        id: "student",
        header: "Student",
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
                gradient={DIVISION_AVATAR[s.division]}
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
        accessorKey: "className",
        header: "Class",
        cell: ({ row }) => <span className="text-sm">{row.original.className || "—"}</span>,
      },
      {
        accessorKey: "division",
        header: "Division",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              DIVISION_PILL[row.original.division]
            )}
          >
            {row.original.division}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
            <Link
              href={`${listHref}/${row.original.id}`}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="View"
            >
              <Eye size={13} />
            </Link>
          </div>
        ),
      },
    ],
    [listHref]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Students</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Students in the classes you teach or are class teacher for.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="My Students"
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
          label="Classes"
          value={classCount}
          icon={<School size={17} className="text-accent-orange" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
        />
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        <DataTable
          columns={columns}
          data={students}
          onRowClick={(s) => router.push(`${listHref}/${s.id}`)}
          searchKey="name"
          searchPlaceholder="Search by name, class…"
        />
      </div>
    </div>
  );
}
