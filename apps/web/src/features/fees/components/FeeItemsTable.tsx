"use client";

import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { formatCedis } from "@/lib/currency";
import { useFeeItems } from "@/features/fees/hooks/use-fees";
import type { FeeItem } from "@/features/fees/types";
import { FeeItemForm } from "./FeeItemForm";

interface FeeItemsTableProps {
  initialData: { items: FeeItem[]; total: number; page: number; size: number };
  baseHref: string;
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

export function FeeItemsTable({ initialData, baseHref }: FeeItemsTableProps) {
  const router = useRouter();
  const { data, isLoading } = useFeeItems({ size: 200 }, { initialData });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Fee Items</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define fees and assign them to learners.
          </p>
        </div>
        <FeeItemForm />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Search fee items…"
        onRowClick={(item) => router.push(`${baseHref}/${item.id}`)}
      />
    </div>
  );
}
