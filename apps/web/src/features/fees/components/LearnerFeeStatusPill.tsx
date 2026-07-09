import { cn } from "@/lib/utils";
import { LEARNER_FEE_STATUS_LABELS, type LearnerFeeStatus } from "@/features/fees/types";

const COLORS: Record<LearnerFeeStatus, string> = {
  outstanding: "bg-amber-100 text-amber-700",
  partial: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  waived: "bg-gray-100 text-gray-700",
};

export function LearnerFeeStatusPill({
  status,
  className,
}: {
  status: LearnerFeeStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        COLORS[status],
        className,
      )}
    >
      {LEARNER_FEE_STATUS_LABELS[status]}
    </span>
  );
}
