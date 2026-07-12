"use client";

import { CalendarOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/features/attendance/types";

interface MyLeaveRequestsProps {
  requests: LeaveRequest[];
}

function formatDateRange(start: string, end: string): string {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

const leaveTypePill: Record<LeaveType, string> = {
  Casual: "bg-blue-100 text-blue-700",
  Sick: "bg-red-100 text-red-700",
  Maternity: "bg-pink-100 text-pink-700",
  Paternity: "bg-pink-100 text-pink-700",
  Study: "bg-purple-100 text-purple-700",
  Compassionate: "bg-slate-100 text-slate-700",
  Other: "bg-gray-100 text-gray-600",
};

const statusPill: Record<LeaveRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export function MyLeaveRequests({ requests }: MyLeaveRequestsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">My Leave Requests</CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
              <CalendarOff size={16} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No leave requests yet</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto leading-relaxed">
              Submit a leave request from the form above. Your Deputy Head will approve or decline.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between gap-4 py-3 border-b border-border/40 last:border-0"
              >
                <div className="min-w-0">
                  <Badge variant="secondary" className={cn(leaveTypePill[r.type])}>
                    {r.type}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDateRange(r.startDate, r.endDate)}
                  </p>
                  {r.reason && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.reason}</p>
                  )}
                  {r.substituteStaffName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Covered by {r.substituteStaffName}
                    </p>
                  )}
                  {r.documentUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {r.documentUrls.map((path) => (
                        <ClientDocumentDownloadLink
                          key={path}
                          storagePath={path}
                          variant="inline"
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <Badge variant="secondary" className={cn(statusPill[r.status])}>
                    {r.status}
                  </Badge>
                  {r.status === "rejected" && r.rejectionReason && (
                    <p className="text-xs text-red-600 mt-1">Reason: {r.rejectionReason}</p>
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
