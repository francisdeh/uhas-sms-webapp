"use client";

/**
 * TanStack Query hooks for the Subjects domain.
 *
 * Query keys are structured `["subjects", "list", filters]` so:
 *   - `queryClient.invalidateQueries({ queryKey: ["subjects"] })` busts
 *     everything below (list + individual gets).
 *   - `["subjects", "list", filters]` is uniquely-keyed per filter combo
 *     so paginated list pages don't step on each other.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api/browser";
import type { components } from "@/types/api";

type SubjectRead = components["schemas"]["SubjectRead"];
type SubjectsList = components["schemas"]["SubjectsListResponse"];

export type SubjectListFilters = {
  q?: string;
  division?: string;
  page?: number;
  size?: number;
};

export const subjectKeys = {
  all: ["subjects"] as const,
  lists: () => [...subjectKeys.all, "list"] as const,
  list: (filters: SubjectListFilters) =>
    [...subjectKeys.lists(), filters] as const,
  details: () => [...subjectKeys.all, "detail"] as const,
  detail: (id: string) => [...subjectKeys.details(), id] as const,
};

export function useSubjects(
  filters: SubjectListFilters = {},
  options?: Partial<UseQueryOptions<SubjectsList, ApiError>>,
) {
  return useQuery<SubjectsList, ApiError>({
    queryKey: subjectKeys.list(filters),
    queryFn: () => api.subjects.list(filters),
    // Keep old page data visible while the next page loads — prevents
    // the DataTable from flashing to "no results" during pagination.
    placeholderData: (prev) => prev,
    ...options,
  });
}

export function useSubject(id: string | undefined) {
  return useQuery<SubjectRead, ApiError>({
    queryKey: id ? subjectKeys.detail(id) : ["subjects", "detail", "none"],
    queryFn: () => api.subjects.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateSubject() {
  const qc = useQueryClient();
  return useMutation<SubjectRead, ApiError, components["schemas"]["SubjectCreate"]>({
    mutationFn: (payload) => api.subjects.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: subjectKeys.lists() }),
  });
}

export function useUpdateSubject(id: string) {
  const qc = useQueryClient();
  return useMutation<SubjectRead, ApiError, components["schemas"]["SubjectUpdate"]>({
    mutationFn: (payload) => api.subjects.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subjectKeys.lists() });
      qc.invalidateQueries({ queryKey: subjectKeys.detail(id) });
    },
  });
}
