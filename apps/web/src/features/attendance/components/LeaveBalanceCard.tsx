import { CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { LeaveBalance } from "@/features/attendance/types";

interface LeaveBalanceCardProps {
  balance: LeaveBalance;
}

// Casual leave only — see the leave-management-depth design doc for
// why the other six leave types don't work as a fixed annual quota.
export function LeaveBalanceCard({ balance }: LeaveBalanceCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center flex-shrink-0">
          <CalendarDays size={16} />
        </div>
        <div>
          <p className="text-sm font-semibold">
            {balance.remainingDays} of {balance.entitlementDays} Casual days remaining
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {balance.usedDays} used this year
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
