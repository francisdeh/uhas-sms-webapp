"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";
import type {
  CreateStudentDocumentInput,
  GuardianLink,
  Medical,
  MedicalUpdateInput,
  Sibling,
  StudentDocument,
} from "@/features/students/types";
import { studentKeys } from "./use-students";

const guardianKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "guardians"] as const;
const siblingKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "siblings"] as const;
const medicalKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "medical"] as const;
const documentsKey = (studentId: string) =>
  [...studentKeys.detail(studentId), "documents"] as const;

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

export function useStudentMedical(studentId: string, enabled = true) {
  return useQuery<Medical>({
    queryKey: medicalKey(studentId),
    queryFn: async () => {
      const m = await api.students.getMedical(studentId);
      return {
        bloodType: m.bloodType ?? null,
        medicalNotes: m.medicalNotes ?? null,
        emergencyContactName: m.emergencyContactName ?? null,
        emergencyContactPhone: m.emergencyContactPhone ?? null,
      };
    },
    enabled: enabled && !!studentId,
  });
}

export function useUpdateStudentMedical(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: MedicalUpdateInput) => api.students.updateMedical(studentId, payload),
    onSuccess: () => {
      toast.success("Medical info saved.");
      qc.invalidateQueries({ queryKey: medicalKey(studentId) });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to save medical info."),
  });
}

export function useStudentDocuments(studentId: string, enabled = true) {
  return useQuery<StudentDocument[]>({
    queryKey: documentsKey(studentId),
    queryFn: () => api.students.listDocuments(studentId),
    enabled: enabled && !!studentId,
  });
}

export function useStudentDocumentMutations(studentId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: documentsKey(studentId) });

  const add = useMutation({
    mutationFn: (payload: CreateStudentDocumentInput) => api.students.addDocument(studentId, payload),
    onSuccess: () => {
      toast.success("Document uploaded.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to upload document."),
  });

  const remove = useMutation({
    mutationFn: (documentId: string) => api.students.removeDocument(studentId, documentId),
    onSuccess: () => {
      toast.success("Document removed.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to remove document."),
  });

  return { add, remove };
}

export function useGuardianLinkMutations(studentId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: guardianKey(studentId) });
    qc.invalidateQueries({ queryKey: siblingKey(studentId) });
  };

  const add = useMutation({
    mutationFn: (payload: components["schemas"]["StudentGuardianAddRequest"]) =>
      api.students.addGuardian(studentId, payload),
    onSuccess: () => {
      toast.success("Guardian added.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed to add guardian."),
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
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to update guardian link."),
  });

  const remove = useMutation({
    mutationFn: (guardianId: string) => api.students.removeGuardian(studentId, guardianId),
    onSuccess: () => {
      toast.success("Guardian unlinked.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to unlink guardian."),
  });

  const createLogin = useMutation({
    mutationFn: (guardianId: string) => api.guardians.createLogin(guardianId),
    onSuccess: (user) => {
      toast.success(
        user.email
          ? `Login created — invite sent to ${user.email}.`
          : "Login created — the guardian can sign in with their phone (OTP).",
      );
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to create login."),
  });

  // Edits the guardian's own name/phone/email — distinct from `update`,
  // which only edits the relation/isPrimary fields on the student↔guardian
  // link row.
  const editContact = useMutation({
    mutationFn: ({
      guardianId,
      payload,
    }: {
      guardianId: string;
      payload: components["schemas"]["GuardianUpdate"];
    }) => api.guardians.update(guardianId, payload),
    onSuccess: () => {
      toast.success("Guardian contact info updated.");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Failed to update guardian contact info."),
  });

  return { add, update, remove, createLogin, editContact };
}
