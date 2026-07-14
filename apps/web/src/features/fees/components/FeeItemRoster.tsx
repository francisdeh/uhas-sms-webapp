"use client";

import Link from "next/link";
import { ArrowLeft, Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCedis } from "@/lib/currency";
import { useAssignFeeItem, useFeeItemRoster } from "@/features/fees/hooks/use-fees";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import type { FeeItem, LearnerFee } from "@/features/fees/types";
import { LearnerFeesTable } from "./LearnerFeesTable";

interface FeeItemRosterProps {
  feeItem: FeeItem;
  initialRoster: LearnerFee[];
  backHref: string;
}

export function FeeItemRoster({ feeItem, initialRoster, backHref }: FeeItemRosterProps) {
  useBreadcrumbLabel(feeItem.id, feeItem.name);

  const { data: roster, isLoading } = useFeeItemRoster(feeItem.id, {
    initialData: initialRoster,
  });
  const assign = useAssignFeeItem();

  return (
    <div className="space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} className="mr-1" /> Back to fee items
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{feeItem.name}</h1>
            <Badge variant="secondary">{feeItem.scopeDisplay}</Badge>
            {!feeItem.isActive && <Badge variant="outline">Inactive</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCedis(feeItem.amountMinor)} ·{" "}
            {feeItem.term ? `Term ${feeItem.term}, ${feeItem.academicYear}` : `${feeItem.academicYear} (Annual)`}
          </p>
        </div>
        <Button onClick={() => assign.mutate(feeItem.id)} disabled={assign.isPending}>
          {assign.isPending ? (
            <Loader2 size={14} className="mr-1.5 animate-spin" />
          ) : (
            <Users size={14} className="mr-1.5" />
          )}
          Assign to roster
        </Button>
      </div>

      {(roster ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="No learners assigned yet"
          description="Assign this fee item to its scope's roster to create one balance per learner."
          action={
            <Button size="sm" onClick={() => assign.mutate(feeItem.id)} disabled={assign.isPending}>
              <Users size={13} className="mr-1.5" /> Assign to roster
            </Button>
          }
        />
      ) : (
        <LearnerFeesTable data={roster ?? []} isLoading={isLoading} />
      )}
    </div>
  );
}
