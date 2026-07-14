"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, CheckCircle2, Ban, CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { formatCedis } from "@/lib/currency";
import { useFeeItems } from "@/features/fees/hooks/use-fees";
import type { FeeItem } from "@/features/fees/types";
import { FeeItemForm } from "./FeeItemForm";

interface FeeItemsTableProps {
  initialData: { items: FeeItem[]; total: number; page: number; size: number };
  baseHref: string;
  currentYear: string;
  yearOptions: string[];
}

const columns: ColumnDef<FeeItem>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "scopeDisplay", header: "Applies to" },
  {
    id: "period",
    header: "Period",
    cell: ({ row }) => {
      const item = row.original;
      return item.term ? `Term ${item.term}, ${item.academicYear}` : `${item.academicYear} (Annual)`;
    },
  },
  {
    accessorKey: "amountMinor",
    header: "Amount",
    cell: ({ row }) => formatCedis(row.original.amountMinor),
  },
  {
    accessorKey: "isActive",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.isActive ? "secondary" : "outline"}>
        {row.original.isActive ? "Active" : "Inactive"}
      </Badge>
    ),
  },
];

export function FeeItemsTable({ initialData, baseHref, currentYear, yearOptions }: FeeItemsTableProps) {
  const router = useRouter();
  const { data, isLoading } = useFeeItems({ size: 200 }, { initialData });
  const items = data?.items ?? [];
  const activeCount = items.filter((i) => i.isActive).length;
  const inactiveCount = items.filter((i) => !i.isActive).length;
  const thisYearCount = items.filter((i) => i.academicYear === currentYear).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Fee Items</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define fees and assign them to learners.
          </p>
        </div>
        <FeeItemForm currentYear={currentYear} yearOptions={yearOptions} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Fee Items"
          value={items.length}
          icon={<ClipboardList size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Active"
          value={activeCount}
          icon={<CheckCircle2 size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Inactive"
          value={inactiveCount}
          icon={<Ban size={17} className="text-gray-500" />}
          iconBg="bg-gray-100 dark:bg-gray-800"
        />
        <StatCard
          label={currentYear}
          value={thisYearCount}
          icon={<CalendarRange size={17} className="text-purple-600" />}
          iconBg="bg-purple-50 dark:bg-purple-950/40"
        />
      </div>

      <div className="bg-card border border-border/60 rounded-xl p-4">
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          searchKey="name"
          searchPlaceholder="Search fee items…"
          onRowClick={(item) => router.push(`${baseHref}/${item.id}`)}
        />
      </div>
    </div>
  );
}
