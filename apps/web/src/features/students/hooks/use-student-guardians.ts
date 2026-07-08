"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";
import type { GuardianLink, Sibling } from "@/features/students/types";
import { studentKeys } from "./use-students";

const guardianKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "guardians"] as const;
const siblingKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "siblings"] as const;

export function useStudentGuardians(studentId: string, enabled = true) {
  return useQuery<GuardianLink[]>({
    queryKey: guardianKey(studentId),
    queryFn: () => api.students.guardians(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useStudentSiblings(studentId: string, enabled = true) {
  return useQuery<Sibling[]>({
    queryKey: siblingKey(studentId),
    queryFn: () => api.students.siblings(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useGuardianLinkMutations(studentId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: guardianKey(studentId) });
    qc.invalidateQueries({ queryKey: siblingKey(studentId) });
  };
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Something went wrong.");

  const add = useMutation({
    mutationFn: (payload: components["schemas"]["StudentGuardianAddRequest"]) =>
      api.students.addGuardian(studentId, payload),
    onSuccess: () => {
      toast.success("Guardian added.");
      invalidate();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({
      guardianId,
      payload,
    }: {
      guardianId: string;
      payload: components["schemas"]["StudentGuardianUpdateRequest"];
    }) => api.students.updateGuardianLink(studentId, guardianId, payload),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (guardianId: string) => api.students.removeGuardian(studentId, guardianId),
    onSuccess: () => {
      toast.success("Guardian unlinked.");
      invalidate();
    },
    onError,
  });

  return { add, update, remove };
}
