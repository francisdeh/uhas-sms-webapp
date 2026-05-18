import { cn } from "@/lib/utils";
import type { LessonPlanStatus } from "@/features/lesson-plans/types";

const COLORS: Record<LessonPlanStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  unit_head_approved: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const LABELS: Record<LessonPlanStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  unit_head_approved: "Unit Head approved",
  approved: "Approved",
  rejected: "Rejected",
};

export function StatusPill({ status, className }: { status: LessonPlanStatus; className?: string }) {
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

export const LESSON_PLAN_STATUS_LABELS = LABELS;
