"use client";

import { useState } from "react";
import Link from "next/link";
import { School, BookOpen, GraduationCap, BookMarked, Eye, Plus, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { useClasses } from "@/features/classes/hooks/use-classes";
import type { components } from "@/types/api";
import type { Division } from "@/features/classes/types";
import { cn } from "@/lib/utils";

type ClassRead = components["schemas"]["ClassRead"];

const DIVISION_PILL: Record<Division, string> = {
  KG: "bg-purple-100 text-purple-700",
  "Lower Primary": "bg-sky-100 text-sky-700",
  "Upper Primary": "bg-blue-100 text-blue-700",
  JHS: "bg-orange-100 text-accent-orange",
};

type DivisionFilter = Division | "All";

interface ClassesTableProps {
  /** Where the "Add class" button + row-detail links point to. */
  listHref: string;
  /** Read-only view — no create / no edit affordances. */
  readonly?: boolean;
}

export default function ClassesTable({
  listHref,
  readonly = false,
}: ClassesTableProps) {
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>("All");

  // Server-side filter — the API handles division scoping.
  const { data, isLoading, error } = useClasses({
    division: divisionFilter === "All" ? undefined : divisionFilter,
    size: 100,
  });
  const classes: ClassRead[] = data?.items ?? [];
  const total = data?.total ?? 0;

  // Small aggregations for the stat cards, computed client-side from
  // the same page's items — good enough for the "at a glance" panel.
  const kgCount = classes.filter((c) => c.division === "KG").length;
  const lowerPrimaryCount = classes.filter((c) => c.division === "Lower Primary").length;
  const upperPrimaryCount = classes.filter((c) => c.division === "Upper Primary").length;
  const jhsCount = classes.filter((c) => c.division === "JHS").length;

  const columns: ColumnDef<ClassRead>[] = [
    {
      id: "class",
      header: "Class",
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <div className="py-0.5">
          <p className="text-sm font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.academicYear}</p>
        </div>
      ),
    },
    {
      accessorKey: "division",
      header: "Division",
      cell: ({ row }) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
            DIVISION_PILL[row.original.division as Division],
          )}
        >
          {row.original.division}
        </span>
      ),
    },
    {
      id: "classTeacher",
      header: "Class Teacher",
      accessorFn: (row) => row.primaryTeacherName ?? "",
      cell: ({ row }) => {
        const name = row.original.primaryTeacherName;
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
      cell: ({ row }) => (
        <span className="text-sm">{row.original.studentCount ?? 0}</span>
      ),
    },
    ...(!readonly
      ? ([
          {
            id: "actions",
            header: "",
            cell: ({ row }: { row: { original: ClassRead } }) => (
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
          },
        ] as ColumnDef<ClassRead>[])
      : []),
  ];

  return (
    <div className="space-y-5">
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

      <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["All", "KG", "Lower Primary", "Upper Primary", "JHS"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDivisionFilter(d)}
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border",
                divisionFilter === d
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-600 dark:border-slate-600"
                  : "bg-transparent text-muted-foreground border-border/60 hover:border-border hover:text-foreground",
              )}
            >
              {d === "All" ? "All divisions" : d}
            </button>
          ))}
        </div>

        {error ? (
          <div className="text-sm text-destructive">{error.message}</div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
            <Loader2 size={14} className="animate-spin mr-2" /> Loading classes…
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={classes}
            searchKey="class"
            searchPlaceholder="Search by class name…"
          />
        )}
      </div>
    </div>
  );
}
