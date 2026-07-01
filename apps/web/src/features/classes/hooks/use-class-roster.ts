"use client";

/**
 * Roster hook for a single class — thin wrapper around
 * `api.classes.enrollments(classId, {status: "Active"})`. Kept in its own
 * file so it can share the `classKeys` cache namespace with
 * `use-classes.ts` without a circular import.
 */

import { useQuery } from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api/browser";
import { classKeys } from "@/features/classes/hooks/use-classes";
import type { components } from "@/types/api";

type EnrollmentsList = components["schemas"]["EnrollmentsListResponse"];

export function useClassRoster(classId: string | undefined) {
  return useQuery<EnrollmentsList, ApiError>({
    queryKey: classId
      ? [...classKeys.detail(classId), "roster"]
      : ["classes", "roster", "none"],
    queryFn: () =>
      api.classes.enrollments(classId!, { status: "Active", size: 200 }),
    enabled: Boolean(classId),
  });
}
