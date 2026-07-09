"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["schemes"] as const,
  lists: () => [...KEYS.root, "list"] as const,
  list: (params: Record<string, unknown>) => [...KEYS.lists(), params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
} as const;

export function useSchemes(
  params: {
    teacherId?: string;
    status?: string;
    division?: string;
    term?: number;
    academicYear?: string;
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.schemes.list(params),
  });
}

export function useScheme(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.schemes.get(id!),
    enabled: Boolean(id),
  });
}

type Data = components["schemas"]["SchemeRead"];
type CreateVars = components["schemas"]["SchemeCreate"];
type UpdateVars = { id: string; payload: components["schemas"]["SchemeUpdate"] };
type AcknowledgeVars = {
  id: string;
  payload: components["schemas"]["SchemeAcknowledgeRequest"];
};
type CommentVars = {
  id: string;
  payload: components["schemas"]["SchemeCommentRequest"];
};
type AddEntryVars = {
  id: string;
  payload: components["schemas"]["SchemeWeeklyEntryAddRequest"];
};
type UpdateEntryVars = {
  id: string;
  entryId: string;
  payload: components["schemas"]["SchemeWeeklyEntryUpdateRequest"];
};
type RemoveEntryVars = { id: string; entryId: string };

export function useCreateScheme() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.schemes.create(payload),
    onSuccess: () => {
      toast.success("Scheme created.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateScheme() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, UpdateVars>({
    mutationFn: ({ id, payload }) => api.schemes.update(id, payload),
    onSuccess: () => {
      toast.success("Scheme saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useSubmitScheme() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, string>({
    mutationFn: (id) => api.schemes.submit(id),
    onSuccess: () => {
      toast.success("Scheme submitted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useAcknowledgeScheme() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, AcknowledgeVars>({
    mutationFn: ({ id, payload }) => api.schemes.acknowledge(id, payload),
    onSuccess: () => {
      toast.success("Scheme acknowledged.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCommentOnScheme() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CommentVars>({
    mutationFn: ({ id, payload }) => api.schemes.comment(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useAddSchemeEntry() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, AddEntryVars>({
    mutationFn: ({ id, payload }) => api.schemes.addEntry(id, payload),
    onSuccess: () => {
      toast.success("Week added.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateSchemeEntry() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, UpdateEntryVars>({
    mutationFn: ({ id, entryId, payload }) => api.schemes.updateEntry(id, entryId, payload),
    onSuccess: () => {
      toast.success("Week updated.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useRemoveSchemeEntry() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, RemoveEntryVars>({
    mutationFn: ({ id, entryId }) => api.schemes.removeEntry(id, entryId),
    onSuccess: () => {
      toast.success("Week removed.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteScheme() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.schemes.delete(id),
    onSuccess: () => {
      toast.success("Scheme deleted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
