"use client";

import { Users, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCedis } from "@/lib/currency";
import { useAssignFeeItem, useFeeItemRoster } from "@/features/fees/hooks/use-fees";
import { useBreadcrumbLabel } from "@/features/shell/breadcrumb-context";
import type { FeeItem, LearnerFee } from "@/features/fees/types";
import { LearnerFeesTable } from "./LearnerFeesTable";

interface FeeItemRosterProps {
  feeItem: FeeItem;
  initialRoster: LearnerFee[];
}

export function FeeItemRoster({ feeItem, initialRoster }: FeeItemRosterProps) {
  useBreadcrumbLabel(feeItem.id, feeItem.name);

  const { data: roster, isLoading } = useFeeItemRoster(feeItem.id, {
    initialData: initialRoster,
  });
  const assign = useAssignFeeItem();

  return (
    <div className="space-y-5">
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
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <CardTitle className="text-sm font-semibold">Assigned Roster</CardTitle>
            <span className="text-xs rounded-full bg-muted px-2 py-0.5 font-medium">
              {(roster ?? []).length}
            </span>
          </CardHeader>
          <CardContent className="pt-0">
            <LearnerFeesTable data={roster ?? []} isLoading={isLoading} bare />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
