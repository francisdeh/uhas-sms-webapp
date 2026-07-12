"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useLeaveBalance,
  useUpdateLeaveStatus,
  useUpdateLeaveSubstitute,
} from "@/features/leave-requests/hooks/use-leave-requests";
import { useStaffList } from "@/features/staff/hooks/use-staff";
import { ClientDocumentDownloadLink } from "@/features/uploads/components/ClientDocumentDownloadLink";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "@/features/attendance/types";

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  /** Empty-state copy — "your division" (Deputy Head) or "your school" (Admin). */
  scopeDescription?: string;
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

function CasualBalanceHint({ staffId }: { staffId: string }) {
  const { data: balance } = useLeaveBalance(staffId);
  if (!balance) return null;
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      {balance.remainingDays} of {balance.entitlementDays} Casual days remaining this year
    </p>
  );
}

function SubstitutePicker({ request }: { request: LeaveRequest }) {
  const router = useRouter();
  const { data: staffList } = useStaffList({ activeOnly: true, size: 200 });
  const updateSubstitute = useUpdateLeaveSubstitute();
  const options = (staffList?.items ?? []).filter((s) => s.id !== request.staffId);

  async function onValueChange(v: string | null) {
    if (!v) return;
    try {
      await updateSubstitute.mutateAsync({
        id: request.id,
        payload: { substituteStaffId: v === "none" ? null : v },
      });
      router.refresh();
    } catch {
      /* toast handled inside the hook */
    }
  }

  return (
    <Select
      value={request.substituteStaffId ?? "none"}
      onValueChange={onValueChange}
      disabled={updateSubstitute.isPending}
    >
      <SelectTrigger className="h-7 text-xs w-[160px]">
        <SelectValue placeholder="Assign cover" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No substitute</SelectItem>
        {options.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.firstName} {s.lastName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LeaveRequestList({
  requests,
  scopeDescription = "your division",
}: LeaveRequestListProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | LeaveRequestStatus>("all");
  const [rejectionInputs, setRejectionInputs] = useState<Record<string, string>>({});
  const [approveDialogId, setApproveDialogId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);

  const updateStatus = useUpdateLeaveStatus();
  const isPending = updateStatus.isPending;

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const filtered = requests.filter((r) => filter === "all" || r.status === filter);

  async function handleApprove(id: string) {
    try {
      await updateStatus.mutateAsync({ id, payload: { status: "approved" } });
      setApproveDialogId(null);
      router.refresh();
    } catch {
      /* toast handled inside the hook */
    }
  }

  async function handleReject(id: string, reason?: string) {
    try {
      await updateStatus.mutateAsync({
        id,
        payload: { status: "rejected", rejectionReason: reason || null },
      });
      setRejectDialogId(null);
      router.refresh();
    } catch {
      /* toast handled inside the hook */
    }
  }

  const approveTarget = approveDialogId !== null ? requests.find((r) => r.id === approveDialogId) : undefined;
  const rejectTarget = rejectDialogId !== null ? requests.find((r) => r.id === rejectDialogId) : undefined;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Leave Requests</h1>
        <Badge className="bg-amber-100 text-amber-700">{pendingCount} pending</Badge>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "pending", "approved", "rejected", "cancelled"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className={filter === f ? "bg-primary text-primary-foreground" : ""}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={
            filter === "all"
              ? "No leave requests"
              : `No ${filter} leave requests`
          }
          description={
            filter === "all"
              ? `Staff in ${scopeDescription} will appear here when they request leave.`
              : "Try the other filter pills above to see requests in different states."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((request) => (
            <Card key={request.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <span className="font-semibold">{request.staffName}</span>
                    <span
                      className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${leaveTypePill[request.type]}`}
                    >
                      {request.type}
                    </span>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatDateRange(request.startDate, request.endDate)}
                    </p>
                    {request.type === "Casual" && <CasualBalanceHint staffId={request.staffId} />}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusPill[request.status]}`}
                    >
                      {request.status}
                    </span>

                    {request.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => setApproveDialogId(request.id)}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => setRejectDialogId(request.id)}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {request.reason && (
                  <p className="text-sm text-muted-foreground mt-2 truncate">{request.reason}</p>
                )}

                {request.documentUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {request.documentUrls.map((path) => (
                      <ClientDocumentDownloadLink key={path} storagePath={path} variant="inline" />
                    ))}
                  </div>
                )}

                {request.status === "rejected" && request.rejectionReason && (
                  <p className="text-xs text-red-600 mt-1">Reason: {request.rejectionReason}</p>
                )}

                {(request.status === "pending" || request.status === "approved") && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">Cover:</span>
                    <SubstitutePicker request={request} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={approveDialogId !== null}
        onOpenChange={(open) => { if (!open) setApproveDialogId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve leave request?</AlertDialogTitle>
            <AlertDialogDescription>
              {approveTarget
                ? `This will approve ${approveTarget.staffName}'s ${approveTarget.type} leave from ${approveTarget.startDate} to ${approveTarget.endDate}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (approveDialogId) handleApprove(approveDialogId); }}
              disabled={isPending}
            >
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={rejectDialogId !== null}
        onOpenChange={(open) => { if (!open) setRejectDialogId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject leave request?</AlertDialogTitle>
            <AlertDialogDescription>Optionally provide a reason for rejection.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Rejection reason (optional)"
            value={rejectDialogId !== null ? (rejectionInputs[rejectDialogId] ?? "") : ""}
            onChange={(e) => {
              if (rejectDialogId !== null) {
                setRejectionInputs((prev) => ({ ...prev, [rejectDialogId]: e.target.value }));
              }
            }}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rejectDialogId) handleReject(rejectDialogId, rejectionInputs[rejectDialogId]);
              }}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
