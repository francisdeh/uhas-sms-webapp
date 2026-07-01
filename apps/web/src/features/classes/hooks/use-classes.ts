"use client";

/**
 * TanStack Query hooks for the Classes domain + its junction sub-resources.
 *
 * The junction hooks (subjects, teachers) key their queries under the
 * parent classId (`["classes", "detail", id, "subjects"]`) so that a
 * detail-page unmount doesn't wipe them from cache, but a parent-scoped
 * `invalidateQueries({ queryKey: classKeys.detail(id) })` still bumps
 * both. This is the standard cache-hierarchy pattern.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { ApiError, api } from "@/lib/api/browser";
import type { components } from "@/types/api";

type ClassRead = components["schemas"]["ClassRead"];
type ClassesList = components["schemas"]["ClassesListResponse"];
type ClassSubjectsList = components["schemas"]["ClassSubjectsListResponse"];
type ClassTeachersList = components["schemas"]["ClassTeachersListResponse"];

export type ClassListFilters = {
  q?: string;
  division?: string;
  academicYear?: string;
  page?: number;
  size?: number;
};

export const classKeys = {
  all: ["classes"] as const,
  lists: () => [...classKeys.all, "list"] as const,
  list: (filters: ClassListFilters) => [...classKeys.lists(), filters] as const,
  details: () => [...classKeys.all, "detail"] as const,
  detail: (id: string) => [...classKeys.details(), id] as const,
  subjects: (id: string) => [...classKeys.detail(id), "subjects"] as const,
  teachers: (id: string) => [...classKeys.detail(id), "teachers"] as const,
};

export function useClasses(
  filters: ClassListFilters = {},
  options?: Partial<UseQueryOptions<ClassesList, ApiError>>,
) {
  return useQuery<ClassesList, ApiError>({
    queryKey: classKeys.list(filters),
    queryFn: () => api.classes.list(filters),
    placeholderData: (prev) => prev,
    ...options,
  });
}

export function useClass(id: string | undefined) {
  return useQuery<ClassRead, ApiError>({
    queryKey: id ? classKeys.detail(id) : ["classes", "detail", "none"],
    queryFn: () => api.classes.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation<ClassRead, ApiError, components["schemas"]["ClassCreate"]>({
    mutationFn: (payload) => api.classes.create(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.lists() }),
  });
}

export function useUpdateClass(id: string) {
  const qc = useQueryClient();
  return useMutation<ClassRead, ApiError, components["schemas"]["ClassUpdate"]>({
    mutationFn: (payload) => api.classes.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: classKeys.lists() });
      qc.invalidateQueries({ queryKey: classKeys.detail(id) });
    },
  });
}

// ─── Class Subjects (junction) ───────────────────────────────────────────────

export function useClassSubjects(classId: string | undefined) {
  return useQuery<ClassSubjectsList, ApiError>({
    queryKey: classId ? classKeys.subjects(classId) : ["classes", "subjects", "none"],
    queryFn: () => api.classes.subjects.list(classId!),
    enabled: Boolean(classId),
  });
}

export function useAssignClassSubject(classId: string) {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["ClassSubjectRead"],
    ApiError,
    components["schemas"]["ClassSubjectAssignRequest"]
  >({
    mutationFn: (payload) => api.classes.subjects.assign(classId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.subjects(classId) }),
  });
}

export function useSetClassSubjectTeacher(classId: string) {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["ClassSubjectRead"],
    ApiError,
    { subjectId: string; teacherId: string | null }
  >({
    mutationFn: ({ subjectId, teacherId }) =>
      api.classes.subjects.setTeacher(classId, subjectId, { teacherId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.subjects(classId) }),
  });
}

export function useRemoveClassSubject(classId: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (subjectId) => api.classes.subjects.remove(classId, subjectId),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.subjects(classId) }),
  });
}

// ─── Class Teachers (junction) ───────────────────────────────────────────────

export function useClassTeachers(classId: string | undefined) {
  return useQuery<ClassTeachersList, ApiError>({
    queryKey: classId ? classKeys.teachers(classId) : ["classes", "teachers", "none"],
    queryFn: () => api.classes.teachers.list(classId!),
    enabled: Boolean(classId),
  });
}

export function useAssignClassTeacher(classId: string) {
  const qc = useQueryClient();
  return useMutation<
    components["schemas"]["ClassTeacherRead"],
    ApiError,
    components["schemas"]["ClassTeacherAssignRequest"]
  >({
    mutationFn: (payload) => api.classes.teachers.assign(classId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.teachers(classId) }),
  });
}

export function useRemoveClassTeacher(classId: string) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (staffId) => api.classes.teachers.remove(classId, staffId),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.teachers(classId) }),
  });
}
