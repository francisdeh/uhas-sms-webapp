"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

/**
 * TanStack hooks for /exams.
 *
 * Cache hierarchy:
 *   ["exams"]
 *     ["exams", "list", params]
 *     ["exams", "detail", id]
 *     ["exams", "detail", id, "scores", classId, subjectId]
 *
 * Publish / unpublish / create / update all invalidate the whole
 * `["exams"]` subtree because a status flip changes both the list row
 * and any open detail views.
 */

const KEYS = {
  root: ["exams"] as const,
  lists: () => [...KEYS.root, "list"] as const,
  list: (params: Record<string, unknown>) => [...KEYS.lists(), params] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
  scores: (examId: string, classId: string, subjectId: string) =>
    [...KEYS.detail(examId), "scores", classId, subjectId] as const,
} as const;

type ExamData = components["schemas"]["ExamRead"];
type ExamCreateVars = components["schemas"]["ExamCreate"];
type ExamUpdateVars = {
  id: string;
  payload: components["schemas"]["ExamUpdate"];
};

export function useExams(
  params: {
    q?: string;
    academicYear?: string;
    term?: number;
    type?: "MidTerm" | "EndOfTerm";
    published?: boolean;
    page?: number;
    size?: number;
  } = {},
) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: () => api.exams.list(params),
  });
}

export function useExam(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.exams.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateExam() {
  const qc = useQueryClient();
  return useMutation<ExamData, ApiError, ExamCreateVars>({
    mutationFn: (payload) => api.exams.create(payload),
    onSuccess: () => {
      toast.success("Exam created.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateExam() {
  const qc = useQueryClient();
  return useMutation<ExamData, ApiError, ExamUpdateVars>({
    mutationFn: ({ id, payload }) => api.exams.update(id, payload),
    onSuccess: () => {
      toast.success("Exam updated.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function usePublishExam() {
  const qc = useQueryClient();
  return useMutation<ExamData, ApiError, string>({
    mutationFn: (examId) => api.exams.publish(examId),
    onSuccess: () => {
      toast.success("Exam published.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUnpublishExam() {
  const qc = useQueryClient();
  return useMutation<ExamData, ApiError, string>({
    mutationFn: (examId) => api.exams.unpublish(examId),
    onSuccess: () => {
      toast.success("Exam unpublished.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

// ── Scores ──────────────────────────────────────────────────────────────────

type ScoresData = components["schemas"]["ScoresGridResponse"];
type ScoresUpsertVars = {
  examId: string;
  payload: components["schemas"]["ScoresUpsertRequest"];
};

export function useScoresGrid(
  examId: string | undefined,
  classId: string | undefined,
  subjectId: string | undefined,
) {
  return useQuery({
    queryKey:
      examId && classId && subjectId
        ? KEYS.scores(examId, classId, subjectId)
        : [...KEYS.root, "scores", "none"],
    queryFn: () =>
      api.exams.scores.get(examId!, { classId: classId!, subjectId: subjectId! }),
    enabled: Boolean(examId && classId && subjectId),
  });
}

export function useUpsertScores() {
  const qc = useQueryClient();
  return useMutation<ScoresData, ApiError, ScoresUpsertVars>({
    mutationFn: ({ examId, payload }) => api.exams.scores.upsert(examId, payload),
    onSuccess: () => {
      toast.success("Scores saved.");
      // Invalidate the whole exam subtree — a save can shift positions
      // for every student, not just the ones the teacher edited.
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
