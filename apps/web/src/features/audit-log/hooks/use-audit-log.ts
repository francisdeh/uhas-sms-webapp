"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/browser";

/**
 * TanStack read hook for the audit log. Kept lean because the audit
 * page is a read-only Admin view — no mutations, no cache
 * invalidations, just a filtered query with `keepPreviousData` so
 * changing filters doesn't blank the table.
 */

type AuditFilters = {
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
};

const KEYS = {
  root: ["audit-log"] as const,
  list: (params: AuditFilters) => [...KEYS.root, "list", params] as const,
} as const;

export function useAuditLog(params: AuditFilters = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.auditLog.list(params),
    placeholderData: (prev) => prev,
  });
}
