"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import { toFeeItem, toFeesSummary, toLearnerFee } from "@/features/fees/mappers";
import type {
  CreateFeeItemInput,
  FeeItem,
  LearnerFee,
  RecordPaymentInput,
  UpdateFeeItemInput,
  UpdateLearnerFeeInput,
} from "@/features/fees/types";

type FeeItemsPage = { items: FeeItem[]; total: number; page: number; size: number };
type LearnerFeesPage = { items: LearnerFee[]; total: number; page: number; size: number };

const KEYS = {
  root: ["fees"] as const,
  summary: () => [...KEYS.root, "summary"] as const,
  items: (params: Record<string, unknown> = {}) => [...KEYS.root, "items", params] as const,
  item: (feeItemId: string) => [...KEYS.root, "items", feeItemId] as const,
  itemRoster: (feeItemId: string) => [...KEYS.root, "items", feeItemId, "roster"] as const,
  learnerFees: (params: Record<string, unknown> = {}) =>
    [...KEYS.root, "learner-fees", params] as const,
} as const;

export function useFeesSummary() {
  return useQuery({
    queryKey: KEYS.summary(),
    queryFn: async () => toFeesSummary(await api.fees.summary()),
  });
}

export function useFeeItems(
  params: {
    academicYear?: string;
    term?: number;
    isActive?: boolean;
    page?: number;
    size?: number;
  } = {},
  options?: Partial<UseQueryOptions<FeeItemsPage>>,
) {
  return useQuery<FeeItemsPage>({
    queryKey: KEYS.items(params),
    queryFn: async () => {
      const res = await api.fees.listItems(params);
      return { ...res, items: res.items.map(toFeeItem) };
    },
    ...options,
  });
}

export function useFeeItem(feeItemId: string, options?: Partial<UseQueryOptions<FeeItem>>) {
  return useQuery<FeeItem>({
    queryKey: KEYS.item(feeItemId),
    queryFn: async () => toFeeItem(await api.fees.getItem(feeItemId)),
    ...options,
  });
}

export function useFeeItemRoster(
  feeItemId: string | undefined,
  options?: Partial<UseQueryOptions<LearnerFee[]>>,
) {
  return useQuery<LearnerFee[]>({
    queryKey: feeItemId ? KEYS.itemRoster(feeItemId) : [...KEYS.root, "items", "none", "roster"],
    queryFn: async () => (await api.fees.listLearnerFeesForItem(feeItemId!)).map(toLearnerFee),
    enabled: Boolean(feeItemId),
    ...options,
  });
}

export function useLearnerFees(
  params: {
    status?: string;
    studentId?: string;
    feeItemId?: string;
    page?: number;
    size?: number;
  } = {},
  options?: Partial<UseQueryOptions<LearnerFeesPage>>,
) {
  return useQuery<LearnerFeesPage>({
    queryKey: KEYS.learnerFees(params),
    queryFn: async () => {
      const res = await api.fees.listLearnerFees(params);
      return { ...res, items: res.items.map(toLearnerFee) };
    },
    ...options,
  });
}

export function useCreateFeeItem() {
  const qc = useQueryClient();
  return useMutation<FeeItem, ApiError, CreateFeeItemInput>({
    mutationFn: async (payload) => toFeeItem(await api.fees.createItem(payload)),
    onSuccess: () => {
      toast.success("Fee item created.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateFeeItem() {
  const qc = useQueryClient();
  return useMutation<FeeItem, ApiError, { id: string; payload: UpdateFeeItemInput }>({
    mutationFn: async ({ id, payload }) => toFeeItem(await api.fees.updateItem(id, payload)),
    onSuccess: () => {
      toast.success("Fee item saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useAssignFeeItem() {
  const qc = useQueryClient();
  return useMutation<
    { createdCount: number; alreadyAssignedCount: number; learnerFees: LearnerFee[] },
    ApiError,
    string
  >({
    mutationFn: async (id) => {
      const res = await api.fees.assignItem(id);
      return { ...res, learnerFees: (res.learnerFees ?? []).map(toLearnerFee) };
    },
    onSuccess: (res) => {
      toast.success(
        res.createdCount > 0
          ? `Assigned to ${res.createdCount} learner${res.createdCount === 1 ? "" : "s"}.`
          : "Everyone in scope is already assigned.",
      );
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useUpdateLearnerFee() {
  const qc = useQueryClient();
  return useMutation<LearnerFee, ApiError, { id: string; payload: UpdateLearnerFeeInput }>({
    mutationFn: async ({ id, payload }) => toLearnerFee(await api.fees.updateLearnerFee(id, payload)),
    onSuccess: () => {
      toast.success("Saved.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useWaiveLearnerFee() {
  const qc = useQueryClient();
  return useMutation<LearnerFee, ApiError, string>({
    mutationFn: async (id) => toLearnerFee(await api.fees.waiveLearnerFee(id)),
    onSuccess: () => {
      toast.success("Fee waived.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useExcludeLearnerFee() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.fees.excludeLearnerFee(id),
    onSuccess: () => {
      toast.success("Learner excluded.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation<LearnerFee, ApiError, { id: string; payload: RecordPaymentInput }>({
    mutationFn: async ({ id, payload }) => toLearnerFee(await api.fees.recordPayment(id, payload)),
    onSuccess: () => {
      toast.success("Payment recorded.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
