"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  approveLeaveRequestAction,
  rejectLeaveRequestAction,
} from "@/features/attendance/actions";
import type { LeaveRequest } from "@/features/attendance/types";

interface LeaveRequestListProps {
  requests: LeaveRequest[];
  currentUserId: string;
  currentUserName: string;
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

export function LeaveRequestList({
  requests: initialRequests,
  currentUserId,
  currentUserName,
}: LeaveRequestListProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [isPending, startTransition] = useTransition();
  const [rejectionInputs, setRejectionInputs] = useState<Record<string, string>>({});
  const [approveDialogId, setApproveDialogId] = useState<string | null>(null);
  const [rejectDialogId, setRejectDialogId] = useState<string | null>(null);

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const filtered = requests.filter((r) => filter === "all" || r.status === filter);

  function handleApprove(id: string) {
    startTransition(async () => {
      const result = await approveLeaveRequestAction(id, currentUserId, currentUserName);
      if (result.success) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: "approved", approvedById: currentUserId, approvedByName: currentUserName }
              : r
          )
        );
        setApproveDialogId(null);
        toast.success("Leave request approved.");
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleReject(id: string, reason?: string) {
    startTransition(async () => {
      const result = await rejectLeaveRequestAction(id, currentUserId, reason);
      if (result.success) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: "rejected", rejectionReason: reason } : r
          )
        );
        setRejectDialogId(null);
        toast.success("Leave request rejected.");
      } else {
        toast.error(result.error);
      }
    });
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
        {(["all", "pending", "approved", "rejected"] as const).map((f) => (
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
        <p className="text-sm text-muted-foreground mt-8 text-center">
          No {filter === "all" ? "" : filter} leave requests.
        </p>
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

                {request.status === "rejected" && request.rejectionReason && (
                  <p className="text-xs text-red-600 mt-1">Reason: {request.rejectionReason}</p>
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
