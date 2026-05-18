import { cn } from "@/lib/utils";
import type { SchemeStatus } from "@/features/schemes/types";

const COLORS: Record<SchemeStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  acknowledged: "bg-green-100 text-green-700",
};

const LABELS: Record<SchemeStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  acknowledged: "Acknowledged",
};

export function SchemeStatusPill({ status, className }: { status: SchemeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        COLORS[status],
        className
      )}
    >
      {LABELS[status]}
    </span>
  );
}
