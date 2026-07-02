"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/**
 * Cache hierarchy:
 *   ["lesson-plans"]
 *     ["lesson-plans", "list", params]
 *     ["lesson-plans", "detail", id]
 *
 * Every mutation invalidates the whole subtree — a review shifts list
 * order (queues re-sort), a submit changes both list + detail.
 */

const KEYS = {
  root: ["lesson-plans"] as const,
  lists: () => [...KEYS.root, "list"] as const,
  list: (params: Record<string, unknown>) => [...KEYS.lists(), params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
} as const;

export function useLessonPlans(
  params: {
    teacherId?: string;
    status?: string;
    division?: string;
    classId?: string;
    term?: number;
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.lessonPlans.list(params),
  });
}

export function useLessonPlan(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.lessonPlans.get(id!),
    enabled: Boolean(id),
  });
}

type Data = components["schemas"]["LessonPlanRead"];
type CreateVars = components["schemas"]["LessonPlanCreate"];
type UpdateVars = {
  id: string;
  payload: components["schemas"]["LessonPlanUpdate"];
};
type ReviewVars = {
  id: string;
  payload: components["schemas"]["LessonPlanReviewRequest"];
};

export function useCreateLessonPlan() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.lessonPlans.create(payload),
    onSuccess: () => {
      toast.success("Lesson plan created.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateLessonPlan() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, UpdateVars>({
    mutationFn: ({ id, payload }) => api.lessonPlans.update(id, payload),
    onSuccess: () => {
      toast.success("Lesson plan saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useSubmitLessonPlan() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, string>({
    mutationFn: (id) => api.lessonPlans.submit(id),
    onSuccess: () => {
      toast.success("Lesson plan submitted for review.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useReviewLessonPlan() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, ReviewVars>({
    mutationFn: ({ id, payload }) => api.lessonPlans.review(id, payload),
    onSuccess: (data) => {
      const verb: Record<string, string> = {
        approved: "approved",
        unit_head_approved: "advanced to Deputy review",
        rejected: "returned to the teacher",
      };
      toast.success(`Lesson plan ${verb[data.status] ?? "reviewed"}.`);
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useDeleteLessonPlan() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.lessonPlans.delete(id),
    onSuccess: () => {
      toast.success("Lesson plan deleted.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
