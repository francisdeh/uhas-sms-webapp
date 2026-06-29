"use client";

import { useState } from "react";
import Link from "next/link";
import { School, BookOpen, GraduationCap, BookMarked, Eye, Plus } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import type { Division, SchoolClass } from "@/features/classes/types";
import { cn } from "@/lib/utils";

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

type DivisionFilter = Division | "All";

interface ClassesTableProps {
  initialClasses: SchoolClass[];
  studentCounts: Record<string, number>;
  listHref: string;
  readonly?: boolean;
}

function primaryTeacherName(c: SchoolClass): string | null {
  if (c.classTeachers.length === 0) return null;
  const primary = c.classTeachers.find((t) => t.isPrimary) ?? c.classTeachers[0];
  if (c.classTeachers.length === 1) return primary.staffName;
  return `${primary.staffName} +${c.classTeachers.length - 1}`;
}

export default function ClassesTable({
  initialClasses,
  studentCounts,
  listHref,
  readonly = false,
}: ClassesTableProps) {
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("All");

  const total = initialClasses.length;
  const kgCount = initialClasses.filter((c) => c.division === "KG").length;
  const lowerPrimaryCount = initialClasses.filter((c) => c.division === "Lower Primary").length;
  const upperPrimaryCount = initialClasses.filter((c) => c.division === "Upper Primary").length;
  const jhsCount = initialClasses.filter((c) => c.division === "JHS").length;

  const displayedClasses =
    divisionFilter === "All"
      ? initialClasses
      : initialClasses.filter((c) => c.division === divisionFilter);

  const columns: ColumnDef<SchoolClass>[] = [
    {
      id: "class",
      header: "Class",
      accessorFn: (row) => row.name,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="py-0.5">
            <p className="text-sm font-medium">{c.name}</p>
            <p className="text-xs text-muted-foreground">{c.academicYear}</p>
          </div>
        );
      },
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
      id: "classTeacher",
      header: "Class Teacher",
      accessorFn: (row) => primaryTeacherName(row) ?? "",
      cell: ({ row }) => {
        const name = primaryTeacherName(row.original);
        return name ? (
          <span className="text-sm">{name}</span>
        ) : (
          <span className="text-sm text-muted-foreground italic">Unassigned</span>
        );
      },
    },
    {
      id: "students",
      header: "Students",
      cell: ({ row }) => {
        const count = studentCounts[row.original.id] ?? 0;
        return <span className="text-sm">{count}</span>;
      },
    },
    ...(!readonly ? [{
      id: "actions",
      header: "",
      cell: ({ row }: { row: { original: SchoolClass } }) => (
        <div className="flex items-center justify-end">
          <Link
            href={`${listHref}/${row.original.id}`}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="View"
          >
            <Eye size={13} />
          </Link>
        </div>
      ),
    }] as ColumnDef<SchoolClass>[] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Classes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage class records and teacher assignments.
          </p>
        </div>
        {!readonly && (
          <Link
            href={`${listHref}/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 text-white px-5 py-2 text-sm font-medium hover:bg-slate-900 active:bg-slate-950 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
          >
            <Plus size={14} /> Add Class
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total"
          value={total}
          icon={<School size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="KG"
          value={kgCount}
          icon={<BookOpen size={17} className="text-purple-600" />}
          iconBg="bg-purple-50 dark:bg-purple-950/40"
        />
        <StatCard
          label="Primary"
          value={lowerPrimaryCount + upperPrimaryCount}
          icon={<GraduationCap size={17} className="text-blue-600" />}
          iconBg="bg-blue-50 dark:bg-blue-950/40"
        />
        <StatCard
          label="JHS"
          value={jhsCount}
          icon={<BookMarked size={17} className="text-orange-500" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
        />
      </div>

      {/* Table card */}
      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        {/* Division filter pills */}
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

        <DataTable
          columns={columns}
          data={displayedClasses}
          searchKey="class"
          searchPlaceholder="Search by class name…"
        />
      </div>
    </div>
  );
}
