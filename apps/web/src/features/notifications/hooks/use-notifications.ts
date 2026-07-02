"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["notifications"] as const,
  bell: () => [...KEYS.root, "bell"] as const,
} as const;

/**
 * Polls the bell endpoint every 60s — the interval matches the TS side
 * so users don't see behaviour drift between the old and new stacks.
 */
export function useBellData() {
  return useQuery({
    queryKey: KEYS.bell(),
    queryFn: () => api.notifications.getBell(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["MarkReadResponse"],
    ApiError,
    void
  >({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.bell() });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["MarkReadResponse"],
    ApiError,
    string[]
  >({
    mutationFn: (ids) => api.notifications.markRead({ ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.bell() });
    },
    onError: (err) => toast.error(err.message),
  });
}
