"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/**
 * Cache hierarchy:
 *   ["leave-requests"]
 *     ["leave-requests", "list", params]
 *     ["leave-requests", "detail", id]
 *
 * Both the create + status-update mutations invalidate the whole
 * subtree — a status change on one item shifts the list order (sorted
 * by created_at desc, but pending/approved chips move rows).
 */

const KEYS = {
  root: ["leave-requests"] as const,
  lists: () => [...KEYS.root, "list"] as const,
  list: (params: {
    staffId?: string;
    status?: string;
    page?: number;
    size?: number;
  }) => [...KEYS.lists(), params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
} as const;

export function useLeaveRequests(
  params: {
    staffId?: string;
    status?: string;
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.leaveRequests.list(params),
  });
}

export function useLeaveRequest(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.leaveRequests.get(id!),
    enabled: Boolean(id),
  });
}

type CreateVars = components["schemas"]["LeaveRequestCreate"];
type LeaveData = components["schemas"]["LeaveRequestRead"];

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation<LeaveData, ApiError, CreateVars>({
    mutationFn: (payload) => api.leaveRequests.create(payload),
    onSuccess: () => {
      toast.success("Leave request submitted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

type StatusVars = {
  id: string;
  payload: components["schemas"]["LeaveStatusUpdate"];
};

export function useUpdateLeaveStatus() {
  const qc = useQueryClient();
  return useMutation<LeaveData, ApiError, StatusVars>({
    mutationFn: ({ id, payload }) =>
      api.leaveRequests.updateStatus(id, payload),
    onSuccess: (data) => {
      const verb = {
        approved: "approved",
        rejected: "rejected",
        cancelled: "cancelled",
        pending: "updated",
      }[data.status];
      toast.success(`Leave request ${verb}.`);
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
