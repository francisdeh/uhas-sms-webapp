"use client";

/**
 * TanStack Query hooks for the Students domain. Same shape as
 * `use-staff.ts` — keep them in sync when changing the patterns.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/lib/api/browser";
import type { components } from "@/types/api";

export type StudentRow = components["schemas"]["StudentRead"];
export type StudentsListResponse = components["schemas"]["StudentsListResponse"];

type ListParams = {
  q?: string;
  page?: number;
  size?: number;
  division?: string;
  activeOnly?: boolean;
  staffChild?: boolean;
};

export const studentKeys = {
  all: ["students"] as const,
  lists: () => [...studentKeys.all, "list"] as const,
  list: (params: ListParams) => [...studentKeys.lists(), params] as const,
  details: () => [...studentKeys.all, "detail"] as const,
  detail: (id: string) => [...studentKeys.details(), id] as const,
};

export function useStudentsList(
  params: ListParams = {},
  options?: Partial<UseQueryOptions<StudentsListResponse>>,
) {
  return useQuery<StudentsListResponse>({
    queryKey: studentKeys.list(params),
    queryFn: () => api.students.list(params),
    ...options,
  });
}

export function useStudent(id: string) {
  return useQuery<StudentRow>({
    queryKey: studentKeys.detail(id),
    queryFn: () => api.students.get(id),
    enabled: !!id,
  });
}

export function useStudentMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: studentKeys.all });

  const create = useMutation({
    mutationFn: (payload: components["schemas"]["StudentCreate"]) =>
      api.students.create(payload),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: components["schemas"]["StudentUpdate"];
    }) => api.students.update(id, payload),
    onSuccess: invalidate,
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.students.activate(id),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.students.deactivate(id),
    onSuccess: invalidate,
  });

  return { create, update, activate, deactivate };
}
