"use client";

/**
 * TanStack Query hooks for the Staff domain.
 *
 * One module per domain, so the query-key shape and mutation patterns
 * stay centralised. Importing `staffKeys` from here makes invalidation
 * exhaustive: `qc.invalidateQueries({ queryKey: staffKeys.all })`
 * busts every variant of the staff list query at once.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { api } from "@/lib/api/browser";
import type { components } from "@/types/api";

export type StaffRow = components["schemas"]["StaffRead"];
export type StaffListResponse = components["schemas"]["StaffListResponse"];

type ListParams = {
  q?: string;
  page?: number;
  size?: number;
  activeOnly?: boolean;
};

// Hierarchical key shape: every list variant lives under `["staff","list",…]`
// so invalidation can target a single page or every list at once.
export const staffKeys = {
  all: ["staff"] as const,
  lists: () => [...staffKeys.all, "list"] as const,
  list: (params: ListParams) => [...staffKeys.lists(), params] as const,
  details: () => [...staffKeys.all, "detail"] as const,
  detail: (id: string) => [...staffKeys.details(), id] as const,
};

export function useStaffList(
  params: ListParams = {},
  options?: Partial<UseQueryOptions<StaffListResponse>>,
) {
  return useQuery<StaffListResponse>({
    queryKey: staffKeys.list(params),
    queryFn: () => api.staff.list(params),
    ...options,
  });
}

export function useStaff(id: string) {
  return useQuery<StaffRow>({
    queryKey: staffKeys.detail(id),
    queryFn: () => api.staff.get(id),
    enabled: !!id,
  });
}

/**
 * Mutations bundle. Each `mutateAsync` returns the updated row from the
 * server; on success every list query is invalidated so the table
 * re-fetches.
 */
export function useStaffMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: staffKeys.all });

  const create = useMutation({
    mutationFn: (payload: components["schemas"]["StaffCreate"]) =>
      api.staff.create(payload),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: components["schemas"]["StaffUpdate"];
    }) => api.staff.update(id, payload),
    onSuccess: invalidate,
  });

  const changeRole = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: components["schemas"]["StaffRoleChange"];
    }) => api.staff.changeRole(id, payload),
    onSuccess: invalidate,
  });

  const toggleUnitHead = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: components["schemas"]["StaffUnitHeadToggle"];
    }) => api.staff.toggleUnitHead(id, payload),
    onSuccess: invalidate,
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.staff.activate(id),
    onSuccess: invalidate,
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.staff.deactivate(id),
    onSuccess: invalidate,
  });

  return { create, update, changeRole, toggleUnitHead, activate, deactivate };
}
