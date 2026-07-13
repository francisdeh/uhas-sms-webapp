"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/** Cache hierarchy mirrors student attendance — see use-attendance.ts. */
const KEYS = {
  root: ["staff-attendance"] as const,
  lists: () => [...KEYS.root, "sessions", "list"] as const,
  list: (params: {
    division?: string;
    term?: number;
    page?: number;
    size?: number;
  }) => [...KEYS.lists(), params] as const,
  detail: (sessionId: string) =>
    [...KEYS.root, "sessions", "detail", sessionId] as const,
} as const;

export function useStaffAttendanceSessions(
  params: {
    division?: string;
    term?: number;
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.staffAttendance.listSessions(params),
  });
}

export function useStaffAttendanceSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId
      ? KEYS.detail(sessionId)
      : [...KEYS.root, "detail", "none"],
    queryFn: () => api.staffAttendance.getSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

type UpsertVars = components["schemas"]["StaffAttendanceSessionUpsertRequest"];
type UpsertData = components["schemas"]["StaffAttendanceSessionRead"];

export function useUpsertStaffAttendanceSession() {
  const qc = useQueryClient();
  return useMutation<UpsertData, ApiError, UpsertVars>({
    mutationFn: (payload) => api.staffAttendance.upsertSession(payload),
    onSuccess: () => {
      toast.success("Staff attendance saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
