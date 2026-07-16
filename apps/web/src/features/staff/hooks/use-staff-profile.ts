"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type {
  CreateQualificationInput,
  CreateStaffDocumentInput,
  Qualification,
  StaffDocument,
  SubjectExpertise,
} from "@/features/staff/types";
import { staffKeys } from "./use-staff";

const subjectsKey = (staffId: string) => [...staffKeys.detail(staffId), "subjects"] as const;
const qualificationsKey = (staffId: string) =>
  [...staffKeys.detail(staffId), "qualifications"] as const;
const documentsKey = (staffId: string) => [...staffKeys.detail(staffId), "documents"] as const;

export function useStaffSubjects(staffId: string, enabled = true) {
  return useQuery<SubjectExpertise[]>({
    queryKey: subjectsKey(staffId),
    queryFn: () => api.staff.subjects(staffId),
    enabled: enabled && !!staffId,
  });
}

export function useReplaceStaffSubjects(staffId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subjectIds: string[]) =>
      api.staff.replaceSubjects(staffId, { subjectIds }),
    onSuccess: () => {
      toast.success("Subject expertise saved.");
      qc.invalidateQueries({ queryKey: subjectsKey(staffId) });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to save subject expertise."),
  });
}

export function useStaffQualifications(staffId: string, enabled = true) {
  return useQuery<Qualification[]>({
    queryKey: qualificationsKey(staffId),
    queryFn: () => api.staff.qualifications(staffId),
    enabled: enabled && !!staffId,
  });
}

export function useStaffQualificationMutations(staffId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qualificationsKey(staffId) });

  const add = useMutation({
    mutationFn: (payload: CreateQualificationInput) =>
      api.staff.addQualification(staffId, payload),
    onSuccess: () => {
      toast.success("Qualification added.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to add qualification."),
  });

  const remove = useMutation({
    mutationFn: (qualificationId: string) =>
      api.staff.removeQualification(staffId, qualificationId),
    onSuccess: () => {
      toast.success("Qualification removed.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to remove qualification."),
  });

  return { add, remove };
}

export function useStaffDocuments(staffId: string, enabled = true) {
  return useQuery<StaffDocument[]>({
    queryKey: documentsKey(staffId),
    queryFn: () => api.staff.listDocuments(staffId),
    enabled: enabled && !!staffId,
  });
}

export function useStaffDocumentMutations(staffId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: documentsKey(staffId) });

  const add = useMutation({
    mutationFn: (payload: CreateStaffDocumentInput) => api.staff.addDocument(staffId, payload),
    onSuccess: () => {
      toast.success("Document uploaded.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to upload document."),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => api.staff.removeDocument(staffId, documentId),
    onSuccess: () => {
      toast.success("Document removed.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to remove document."),
  });

  return { add, remove };
}
