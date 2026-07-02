"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["announcements"] as const,
  list: (params: Record<string, unknown>) => [...KEYS.root, "list", params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
} as const;

export function useAnnouncements(params: { page?: number; size?: number } = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.announcements.list(params),
  });
}

export function useAnnouncement(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.announcements.get(id!),
    enabled: Boolean(id),
  });
}

type Data = components["schemas"]["AnnouncementRead"];
type CreateVars = components["schemas"]["AnnouncementCreate"];

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.announcements.create(payload),
    onSuccess: () => {
      toast.success("Announcement posted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
      // Also nudge the bell so recipients see the fan-out immediately.
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.announcements.delete(id),
    onSuccess: () => {
      toast.success("Announcement deleted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
