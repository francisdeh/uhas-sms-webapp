"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["promotions"] as const,
  season: () => [...KEYS.root, "season"] as const,
  overview: () => [...KEYS.root, "overview"] as const,
  dhQueue: () => [...KEYS.root, "dh-queue"] as const,
  teacherClasses: () => [...KEYS.root, "teacher-classes"] as const,
  submission: (id: string) => [...KEYS.root, "submission", id] as const,
  submissionByClass: (classId: string) =>
    [...KEYS.root, "submission-by-class", classId] as const,
} as const;

// ─── Season ─────────────────────────────────────────────────────────────────

export function usePromotionSeason() {
  return useQuery({
    queryKey: KEYS.season(),
    queryFn: () => api.promotions.getSeason(),
  });
}

export function useOpenPromotionSeason() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["SeasonOpenResponse"],
    ApiError,
    components["schemas"]["SeasonOpenRequest"]
  >({
    mutationFn: (payload) => api.promotions.openSeason(payload),
    onSuccess: (res) => {
      toast.success(
        res.openedWithOverride
          ? "Season opened in override mode."
          : "Promotion season opened.",
      );
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useClosePromotionSeason() {
  const qc = useQueryClient();
  return useMutation<components["schemas"]["SeasonRead"], ApiError, void>({
    mutationFn: () => api.promotions.closeSeason(),
    onSuccess: () => {
      toast.success("Promotion season closed.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

// ─── Read projections ───────────────────────────────────────────────────────

export function usePromotionOverview() {
  return useQuery({
    queryKey: KEYS.overview(),
    queryFn: () => api.promotions.getOverview(),
  });
}

export function useDeputyHeadPromotionQueue() {
  return useQuery({
    queryKey: KEYS.dhQueue(),
    queryFn: () => api.promotions.getDhQueue(),
  });
}

export function useTeacherPromotionClasses() {
  return useQuery({
    queryKey: KEYS.teacherClasses(),
    queryFn: () => api.promotions.getTeacherClasses(),
  });
}

// ─── Submission ─────────────────────────────────────────────────────────────

export function usePromotionSubmission(id: string | undefined) {
  return useQuery({
    queryKey: id
      ? KEYS.submission(id)
      : [...KEYS.root, "submission", "none"],
    queryFn: () => api.promotions.getSubmission(id!),
    enabled: Boolean(id),
  });
}

export function usePromotionSubmissionByClass(classId: string | undefined) {
  return useQuery({
    queryKey: classId
      ? KEYS.submissionByClass(classId)
      : [...KEYS.root, "submission-by-class", "none"],
    queryFn: () => api.promotions.getSubmissionByClass(classId!),
    enabled: Boolean(classId),
  });
}

export function useEnsurePromotionSubmission() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["EnsureSubmissionResponse"],
    ApiError,
    components["schemas"]["EnsureSubmissionRequest"]
  >({
    mutationFn: (payload) => api.promotions.ensureSubmission(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

type SaveDraftVars = {
  id: string;
  payload: components["schemas"]["SaveDraftRequest"];
};

export function useSavePromotionDraft() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["SubmissionRead"],
    ApiError,
    SaveDraftVars
  >({
    mutationFn: ({ id, payload }) => api.promotions.saveDraft(id, payload),
    onSuccess: () => {
      toast.success("Draft saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

type SubmitVars = {
  id: string;
  payload: components["schemas"]["SubmitListRequest"];
};

export function useSubmitPromotionList() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["SubmissionRead"],
    ApiError,
    SubmitVars
  >({
    mutationFn: ({ id, payload }) => api.promotions.submit(id, payload),
    onSuccess: () => {
      toast.success("Submitted to Deputy Head.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useApprovePromotionSubmission() {
  const qc = useQueryClient();
  return useMutation<components["schemas"]["SubmissionRead"], ApiError, string>({
    mutationFn: (id) => api.promotions.approve(id),
    onSuccess: () => {
      toast.success("Approved — enrolments materialised.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

type SendBackVars = {
  id: string;
  payload: components["schemas"]["SendBackRequest"];
};

export function useSendBackPromotionSubmission() {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["SubmissionRead"],
    ApiError,
    SendBackVars
  >({
    mutationFn: ({ id, payload }) => api.promotions.sendBack(id, payload),
    onSuccess: () => {
      toast.success("Sent back to teacher.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
