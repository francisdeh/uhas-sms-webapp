"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/**
 * TanStack Query hooks for the /attendance surface.
 *
 * Cache hierarchy:
 *   ["attendance"]
 *     ["attendance", "sessions"]
 *       ["attendance", "sessions", "list", params]
 *       ["attendance", "sessions", "detail", sessionId]
 *
 * The batch upsert mutation invalidates the whole `["attendance"]`
 * subtree so both the roster the user just saved AND any open history
 * views for that class refresh.
 */

const KEYS = {
  root: ["attendance"] as const,
  lists: () => [...KEYS.root, "sessions", "list"] as const,
  list: (params: {
    classId?: string;
    term?: number;
    page?: number;
    size?: number;
  }) => [...KEYS.lists(), params] as const,
  detail: (sessionId: string) =>
    [...KEYS.root, "sessions", "detail", sessionId] as const,
} as const;

export function useAttendanceSessions(
  params: { classId?: string; term?: number; page?: number; size?: number } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.attendance.listSessions(params),
  });
}

export function useAttendanceSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? KEYS.detail(sessionId) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.attendance.getSession(sessionId!),
    enabled: Boolean(sessionId),
  });
}

type UpsertVars = components["schemas"]["AttendanceSessionUpsertRequest"];
type UpsertData = components["schemas"]["AttendanceSessionRead"];

export function useUpsertAttendanceSession() {
  const qc = useQueryClient();
  return useMutation<UpsertData, ApiError, UpsertVars>({
    mutationFn: (payload) => api.attendance.upsertSession(payload),
    onSuccess: () => {
      toast.success("Attendance saved.");
      // Nuke the whole attendance subtree — the list summary counts,
      // the specific lookup for this class+date, and any open detail
      // views all need to reflect the new records.
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
