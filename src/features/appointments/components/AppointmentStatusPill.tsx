import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/features/appointments/types";

const COLORS: Record<AppointmentStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-700",
};

const LABELS: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export function AppointmentStatusPill({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
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
