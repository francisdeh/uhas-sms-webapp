"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["assignments"] as const,
  lists: () => [...KEYS.root, "list"] as const,
  list: (params: Record<string, unknown>) => [...KEYS.lists(), params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
} as const;

export function useAssignments(
  params: {
    teacherId?: string;
    status?: string;
    classId?: string;
    forStudentIds?: string[];
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.assignments.list(params),
  });
}

export function useAssignment(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.assignments.get(id!),
    enabled: Boolean(id),
  });
}

type Data = components["schemas"]["AssignmentRead"];
type CreateVars = components["schemas"]["AssignmentCreate"];
type UpdateVars = { id: string; payload: components["schemas"]["AssignmentUpdate"] };

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.assignments.create(payload),
    onSuccess: () => {
      toast.success("Assignment created.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, UpdateVars>({
    mutationFn: ({ id, payload }) => api.assignments.update(id, payload),
    onSuccess: () => {
      toast.success("Assignment saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function usePublishAssignment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, string>({
    mutationFn: (id) => api.assignments.publish(id),
    onSuccess: () => {
      toast.success("Assignment published.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUnpublishAssignment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, string>({
    mutationFn: (id) => api.assignments.unpublish(id),
    onSuccess: () => {
      toast.success("Assignment unpublished.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.assignments.delete(id),
    onSuccess: () => {
      toast.success("Assignment deleted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
