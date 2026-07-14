"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import { formatCedis } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { useExcludeLearnerFee, useWaiveLearnerFee } from "@/features/fees/hooks/use-fees";
import { PAID, WAIVED, type LearnerFee } from "@/features/fees/types";
import { LearnerFeeStatusPill } from "./LearnerFeeStatusPill";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { EditLearnerFeeDialog } from "./EditLearnerFeeDialog";

type ActiveAction =
  | { type: "payment" | "edit" | "view"; row: LearnerFee }
  | { type: "waive" | "exclude"; row: LearnerFee }
  | null;

interface LearnerFeesTableProps {
  data: LearnerFee[];
  isLoading?: boolean;
  showFeeItemColumn?: boolean;
  /** Skip the built-in card wrapper — for callers (e.g. `FeeItemRoster`)
   *  that already render their own `Card`/`CardContent` around this table. */
  bare?: boolean;
}

export function LearnerFeesTable({
  data,
  isLoading,
  showFeeItemColumn = false,
  bare = false,
}: LearnerFeesTableProps) {
  const [action, setAction] = useState<ActiveAction>(null);
  const waive = useWaiveLearnerFee();
  const exclude = useExcludeLearnerFee();

  const columns: ColumnDef<LearnerFee>[] = [
    {
      id: "student",
      header: "Student",
      cell: ({ row }) => `${row.original.studentFirstName} ${row.original.studentLastName}`,
    },
    ...(showFeeItemColumn
      ? [{ accessorKey: "feeItemName", header: "Fee" } as ColumnDef<LearnerFee>]
      : []),
    {
      accessorKey: "amountMinor",
      header: "Amount",
      cell: ({ row }) => formatCedis(row.original.amountMinor),
    },
    {
      accessorKey: "balanceMinor",
      header: "Balance",
      cell: ({ row }) => formatCedis(row.original.balanceMinor),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <LearnerFeeStatusPill status={row.original.status} />,
    },
    {
      accessorKey: "dueDate",
      header: "Due",
      cell: ({ row }) => (row.original.dueDate ? formatDate(row.original.dueDate) : "—"),
    },
    {
      accessorKey: "lastReminderSentAt",
      header: "Last reminded",
      cell: ({ row }) =>
        row.original.lastReminderSentAt ? formatDate(row.original.lastReminderSentAt) : "—",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const lf = row.original;
        const isWaived = lf.status === WAIVED;
        const isPaid = lf.status === PAID;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "h-7 w-7" })}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {!isWaived && !isPaid && (
                <DropdownMenuItem onClick={() => setAction({ type: "payment", row: lf })}>
                  Record payment
                </DropdownMenuItem>
              )}
              {lf.payments.length > 0 && (
                <DropdownMenuItem onClick={() => setAction({ type: "view", row: lf })}>
                  View payments ({lf.payments.length})
                </DropdownMenuItem>
              )}
              {!isWaived && (
                <DropdownMenuItem onClick={() => setAction({ type: "edit", row: lf })}>
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!isWaived && (
                <DropdownMenuItem onClick={() => setAction({ type: "waive", row: lf })}>
                  Waive
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setAction({ type: "exclude", row: lf })}
                className="text-destructive focus:text-destructive"
              >
                Exclude
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = <DataTable columns={columns} data={data} isLoading={isLoading} searchKey="student" />;

  return (
    <>
      {bare ? table : (
        <div className="bg-card border border-border/60 rounded-xl p-4">{table}</div>
      )}

      <RecordPaymentDialog
        learnerFee={action?.type === "payment" ? action.row : null}
        onOpenChange={(open) => !open && setAction(null)}
      />
      <EditLearnerFeeDialog
        learnerFee={action?.type === "edit" ? action.row : null}
        onOpenChange={(open) => !open && setAction(null)}
      />

      <Dialog open={action?.type === "view"} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment history</DialogTitle>
          </DialogHeader>
          {action?.type === "view" && (
            <div className="space-y-3">
              {action.row.payments.map((p) => (
                <div key={p.id} className="rounded-md border border-border/60 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatCedis(p.amountMinor)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(p.paidAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.method} {p.reference ? `· ${p.reference}` : ""} · recorded by{" "}
                    {p.recordedByName}
                  </p>
                  {p.receiptFileUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {p.receiptFileUrls.map((path) => (
                        <ClientDocumentDownloadLink key={path} storagePath={path} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={action?.type === "waive"}
        onOpenChange={(open) => !open && setAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Waive this fee?</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.type === "waive" &&
                `${action.row.studentFirstName} ${action.row.studentLastName}'s ${action.row.feeItemName} will be marked waived. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              disabled={waive.isPending}
              onClick={async () => {
                if (action?.type !== "waive") return;
                try {
                  await waive.mutateAsync(action.row.id);
                  setAction(null);
                } catch {
                  /* toast fired inside the hook */
                }
              }}
            >
              Waive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={action?.type === "exclude"}
        onOpenChange={(open) => !open && setAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exclude this learner?</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.type === "exclude" &&
                `${action.row.studentFirstName} ${action.row.studentLastName} will be removed from this fee. Only possible if no payments have been recorded yet.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive-solid"
              disabled={exclude.isPending}
              onClick={async () => {
                if (action?.type !== "exclude") return;
                try {
                  await exclude.mutateAsync(action.row.id);
                  setAction(null);
                } catch {
                  /* toast fired inside the hook */
                }
              }}
            >
              Exclude
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
