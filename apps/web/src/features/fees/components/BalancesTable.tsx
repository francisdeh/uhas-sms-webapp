"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLearnerFees } from "@/features/fees/hooks/use-fees";
import { LEARNER_FEE_STATUS_LABELS, type LearnerFee, type LearnerFeeStatus } from "@/features/fees/types";
import { LearnerFeesTable } from "./LearnerFeesTable";

type StatusFilter = LearnerFeeStatus | "all";

interface BalancesTableProps {
  initialData: { items: LearnerFee[]; total: number; page: number; size: number };
}

export function BalancesTable({ initialData }: BalancesTableProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const params = status === "all" ? { size: 200 } : { status, size: 200 };
  const { data, isLoading } = useLearnerFees(
    params,
    status === "all" ? { initialData } : undefined,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Balances</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every learner&apos;s balance across all fee items.
          </p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue>
              {(value: string) =>
                value === "all" ? "All statuses" : LEARNER_FEE_STATUS_LABELS[value as LearnerFeeStatus]
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(LEARNER_FEE_STATUS_LABELS) as LearnerFeeStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {LEARNER_FEE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <LearnerFeesTable data={data?.items ?? []} isLoading={isLoading} showFeeItemColumn />
    </div>
  );
}
