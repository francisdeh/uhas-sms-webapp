"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/features/attendance/types";

interface MyLeaveRequestsProps {
  requests: LeaveRequest[];
}

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

const leaveTypePill: Record<string, string> = {
  sick: "bg-red-100 text-red-700",
  maternity: "bg-pink-100 text-pink-700",
  personal: "bg-blue-100 text-blue-700",
  other: "bg-gray-100 text-gray-600",
};

const statusPill: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export function MyLeaveRequests({ requests }: MyLeaveRequestsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">My Leave Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No leave requests submitted yet.
          </p>
        ) : (
          <div className="space-y-0">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0"
              >
                <div className="min-w-0">
                  <Badge
                    variant="secondary"
                    className={cn(leaveTypePill[r.type])}
                  >
                    {r.type}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDateRange(r.startDate, r.endDate)}
                  </p>
                  {r.reason && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.reason}
                    </p>
                  )}
                </div>

                <div className="shrink-0">
                  <Badge
                    variant="secondary"
                    className={cn(statusPill[r.status])}
                  >
                    {r.status}
                  </Badge>
                  {r.status === "rejected" && r.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1">
                      Reason: {r.rejectionReason}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
