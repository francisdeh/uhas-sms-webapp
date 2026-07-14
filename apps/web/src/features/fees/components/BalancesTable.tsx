"use client";

import { useState } from "react";
import { Wallet, CircleDollarSign, CheckCircle2, Ban } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { useLearnerFees } from "@/features/fees/hooks/use-fees";
import {
  OUTSTANDING,
  PAID,
  WAIVED,
  LEARNER_FEE_STATUS_LABELS,
  type LearnerFee,
  type LearnerFeeStatus,
} from "@/features/fees/types";
import { LearnerFeesTable } from "./LearnerFeesTable";

type StatusFilter = LearnerFeeStatus | "all";

interface BalancesTableProps {
  initialData: { items: LearnerFee[]; total: number; page: number; size: number };
}

export function BalancesTable({ initialData }: BalancesTableProps) {
  const [status, setStatus] = useState<StatusFilter>("all");
  // Unfiltered — mirrors StaffTable/StudentsTable: fetch the full set once,
  // filter client-side, so the stat cards stay accurate regardless of the
  // currently-selected status.
  const { data, isLoading } = useLearnerFees({ size: 200 }, { initialData });
  const learnerFees = data?.items ?? [];
  const displayed = status === "all" ? learnerFees : learnerFees.filter((lf) => lf.status === status);

  const outstandingCount = learnerFees.filter((lf) => lf.status === OUTSTANDING).length;
  const paidCount = learnerFees.filter((lf) => lf.status === PAID).length;
  const waivedCount = learnerFees.filter((lf) => lf.status === WAIVED).length;

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Balances"
          value={learnerFees.length}
          icon={<Wallet size={17} className="text-slate-600 dark:text-slate-300" />}
          iconBg="bg-slate-100 dark:bg-slate-800"
        />
        <StatCard
          label="Outstanding"
          value={outstandingCount}
          icon={<CircleDollarSign size={17} className="text-accent-orange" />}
          iconBg="bg-orange-50 dark:bg-orange-950/40"
        />
        <StatCard
          label="Paid"
          value={paidCount}
          icon={<CheckCircle2 size={17} className="text-green-600" />}
          iconBg="bg-green-50 dark:bg-green-950/40"
        />
        <StatCard
          label="Waived"
          value={waivedCount}
          icon={<Ban size={17} className="text-gray-500" />}
          iconBg="bg-gray-100 dark:bg-gray-800"
        />
      </div>

      <LearnerFeesTable data={displayed} isLoading={isLoading} showFeeItemColumn />
    </div>
  );
}
