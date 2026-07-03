"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError } from "@/lib/api/browser";
import type { components } from "@/types/api";

const KEYS = {
  root: ["appointments"] as const,
  list: () => [...KEYS.root, "list"] as const,
  detail: (id: string) => [...KEYS.root, "detail", id] as const,
  teachers: (studentId: string) =>
    [...KEYS.root, "teachers-for-student", studentId] as const,
} as const;

export function useAppointments() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: () => api.appointments.list(),
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: id ? KEYS.detail(id) : [...KEYS.root, "detail", "none"],
    queryFn: () => api.appointments.get(id!),
    enabled: Boolean(id),
  });
}

export function useTeachersForStudent(studentId: string | undefined) {
  return useQuery({
    queryKey: studentId
      ? KEYS.teachers(studentId)
      : [...KEYS.root, "teachers-for-student", "none"],
    queryFn: () => api.appointments.teachersForStudent(studentId!),
    enabled: Boolean(studentId),
  });
}

type Data = components["schemas"]["AppointmentRead"];
type CreateVars = components["schemas"]["AppointmentCreate"];
type RespondVars = { id: string; payload: components["schemas"]["AppointmentRespond"] };

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, CreateVars>({
    mutationFn: (payload) => api.appointments.create(payload),
    onSuccess: () => {
      toast.success("Meeting request sent.");
      qc.invalidateQueries({ queryKey: KEYS.root });
      // Nudge the bell so the teacher sees the fan-out row.
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useRespondToAppointment() {
  const qc = useQueryClient();
  return useMutation<Data, ApiError, RespondVars>({
    mutationFn: ({ id, payload }) => api.appointments.respond(id, payload),
    onSuccess: (row) => {
      toast.success(
        row.status === "confirmed"
          ? "Confirmed — the parent has been notified."
          : "Declined — the parent has been notified.",
      );
      qc.invalidateQueries({ queryKey: KEYS.root });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.appointments.cancel(id),
    onSuccess: () => {
      toast.success("Request cancelled.");
      qc.invalidateQueries({ queryKey: KEYS.root });
    },
    onError: (err) => toast.error(err.message),
  });
}
