"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/**
 * TanStack hooks for the academic calendar. Kept under `features/reports/`
 * for now because that's where the FE view lives; the API side moved
 * calendar out into its own module, but the FE folder move is a Phase 2
 * follow-up (not worth the churn while other bundles are landing).
 */

const KEYS = {
  root: ["calendar"] as const,
} as const;

export function useCalendar() {
  return useQuery({
    queryKey: KEYS.root,
    queryFn: () => api.calendar.list(),
  });
}

type Data = components["schemas"]["CalendarEventRead"];
type CreateVars = components["schemas"]["CalendarEventCreate"];

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.calendar.create(payload),
    onSuccess: () => {
      toast.success("Event added to the calendar.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteCalendarEvent() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.calendar.delete(id),
    onSuccess: () => {
      toast.success("Event deleted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
