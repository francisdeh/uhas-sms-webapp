/**
 * Typed API client for the FastAPI backend.
 *
 * Pattern: thin namespace per feature domain. Each call:
 *   1. Uses types from `@/types/api` so request/response shapes
 *      come straight from the FastAPI Pydantic schemas.
 *   2. Wraps `fetch` with the `Authorization: Bearer …` header
 *      (Supabase JWT — the token-getter is supplied by the caller's
 *      environment via `createApiClient`).
 *   3. Throws `ApiError` on non-2xx so callers (TanStack Query +
 *      route handlers) can branch on it cleanly.
 *
 * Two wrappers consume this factory:
 *   - `@/lib/api/browser` — Client Components, browser Supabase session
 *   - `@/lib/api/server` — Server Components / Route Handlers, server
 *     Supabase session (reads cookies via next/headers)
 *
 * See v2/UHAS_Backend_Architecture_v1.1.md §9 + §10 and
 * docs/ENGINEERING-CONVENTIONS.md §8.
 */

import type { components } from "@/types/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type TokenGetter = () => Promise<string | null>;

async function apiFetch<T>(
  getAuthToken: TokenGetter,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    // FastAPI's AppError handler returns { error: { code, message, details? } }.
    // FastAPI's built-in validation handler returns { detail: [...] }.
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code: string; message: string; details?: Record<string, unknown> };
      detail?: unknown;
    };
    const errorBody = body.error;
    throw new ApiError(
      res.status,
      errorBody?.code ?? "http_error",
      errorBody?.message ?? `HTTP ${res.status}`,
      errorBody?.details,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Domain namespaces — one per feature folder in apps/api/app/features/ ─────

export type ApiClient = ReturnType<typeof createApiClient>;

export function createApiClient(getAuthToken: TokenGetter) {
  return {
    health: {
      get: () =>
        apiFetch<components["schemas"]["HealthResponse"]>(getAuthToken, "/health"),
    },
    school: {
      /** Fetch the caller's school settings. Any authenticated role. */
      get: () =>
        apiFetch<components["schemas"]["SchoolRead"]>(getAuthToken, "/school"),
      /** Partial update of school settings. Admin only — service returns 403 otherwise. */
      patch: (payload: components["schemas"]["SchoolUpdate"]) =>
        apiFetch<components["schemas"]["SchoolRead"]>(getAuthToken, "/school", {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
    },
    schoolTerms: {
      /** List every configured term row for the caller's school. Any role. */
      list: () =>
        apiFetch<components["schemas"]["TermsListResponse"]>(
          getAuthToken,
          "/school/terms",
        ),
      /** Upsert all three terms for one academic year. Admin only. */
      put: (payload: components["schemas"]["TermsUpsertRequest"]) =>
        apiFetch<components["schemas"]["TermsListResponse"]>(
          getAuthToken,
          "/school/terms",
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
        ),
    },
    staff: {
      /** Paginated list. `q` searches name/email/uhasId; `page` is 1-based. */
      list: (
        params: { q?: string; page?: number; size?: number; activeOnly?: boolean } = {},
      ) =>
        apiFetch<components["schemas"]["StaffListResponse"]>(
          getAuthToken,
          `/staff${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["StaffRead"]>(getAuthToken, `/staff/${id}`),
      create: (payload: components["schemas"]["StaffCreate"]) =>
        apiFetch<components["schemas"]["StaffRead"]>(getAuthToken, "/staff", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["StaffUpdate"]) =>
        apiFetch<components["schemas"]["StaffRead"]>(getAuthToken, `/staff/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      changeRole: (id: string, payload: components["schemas"]["StaffRoleChange"]) =>
        apiFetch<components["schemas"]["StaffRead"]>(
          getAuthToken,
          `/staff/${id}/role`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      toggleUnitHead: (
        id: string,
        payload: components["schemas"]["StaffUnitHeadToggle"],
      ) =>
        apiFetch<components["schemas"]["StaffRead"]>(
          getAuthToken,
          `/staff/${id}/unit-head`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      activate: (id: string) =>
        apiFetch<components["schemas"]["StaffRead"]>(
          getAuthToken,
          `/staff/${id}/activate`,
          { method: "POST" },
        ),
      deactivate: (id: string) =>
        apiFetch<components["schemas"]["StaffRead"]>(
          getAuthToken,
          `/staff/${id}/deactivate`,
          { method: "POST" },
        ),
    },
    guardians: {
      list: (params: { q?: string; page?: number; size?: number } = {}) =>
        apiFetch<components["schemas"]["GuardiansListResponse"]>(
          getAuthToken,
          `/guardians${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["GuardianRead"]>(
          getAuthToken,
          `/guardians/${id}`,
        ),
      create: (payload: components["schemas"]["GuardianCreate"]) =>
        apiFetch<components["schemas"]["GuardianRead"]>(getAuthToken, "/guardians", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["GuardianUpdate"]) =>
        apiFetch<components["schemas"]["GuardianRead"]>(
          getAuthToken,
          `/guardians/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
    },
    students: {
      list: (
        params: {
          q?: string;
          page?: number;
          size?: number;
          division?: string;
          activeOnly?: boolean;
        } = {},
      ) =>
        apiFetch<components["schemas"]["StudentsListResponse"]>(
          getAuthToken,
          `/students${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["StudentRead"]>(
          getAuthToken,
          `/students/${id}`,
        ),
      create: (payload: components["schemas"]["StudentCreate"]) =>
        apiFetch<components["schemas"]["StudentRead"]>(getAuthToken, "/students", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["StudentUpdate"]) =>
        apiFetch<components["schemas"]["StudentRead"]>(
          getAuthToken,
          `/students/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      activate: (id: string) =>
        apiFetch<components["schemas"]["StudentRead"]>(
          getAuthToken,
          `/students/${id}/activate`,
          { method: "POST" },
        ),
      deactivate: (id: string) =>
        apiFetch<components["schemas"]["StudentRead"]>(
          getAuthToken,
          `/students/${id}/deactivate`,
          { method: "POST" },
        ),
      /** Enrollment history for one student, most recent year first. */
      enrollments: (
        studentId: string,
        params: { page?: number; size?: number } = {},
      ) =>
        apiFetch<components["schemas"]["EnrollmentsListResponse"]>(
          getAuthToken,
          `/students/${studentId}/enrollments${buildQuery(params)}`,
        ),
    },
    subjects: {
      list: (
        params: { q?: string; division?: string; page?: number; size?: number } = {},
      ) =>
        apiFetch<components["schemas"]["SubjectsListResponse"]>(
          getAuthToken,
          `/subjects${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["SubjectRead"]>(getAuthToken, `/subjects/${id}`),
      create: (payload: components["schemas"]["SubjectCreate"]) =>
        apiFetch<components["schemas"]["SubjectRead"]>(getAuthToken, "/subjects", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["SubjectUpdate"]) =>
        apiFetch<components["schemas"]["SubjectRead"]>(
          getAuthToken,
          `/subjects/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
    },
    classes: {
      list: (
        params: {
          q?: string;
          division?: string;
          academicYear?: string;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["ClassesListResponse"]>(
          getAuthToken,
          `/classes${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["ClassRead"]>(getAuthToken, `/classes/${id}`),
      create: (payload: components["schemas"]["ClassCreate"]) =>
        apiFetch<components["schemas"]["ClassRead"]>(getAuthToken, "/classes", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["ClassUpdate"]) =>
        apiFetch<components["schemas"]["ClassRead"]>(
          getAuthToken,
          `/classes/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      /** Roster — students currently enrolled in this class (with status filter). */
      enrollments: (
        classId: string,
        params: { status?: string; page?: number; size?: number } = {},
      ) =>
        apiFetch<components["schemas"]["EnrollmentsListResponse"]>(
          getAuthToken,
          `/classes/${classId}/enrollments${buildQuery(params)}`,
        ),
      /** Subject-assignment sub-resource. */
      subjects: {
        list: (classId: string) =>
          apiFetch<components["schemas"]["ClassSubjectsListResponse"]>(
            getAuthToken,
            `/classes/${classId}/subjects`,
          ),
        assign: (
          classId: string,
          payload: components["schemas"]["ClassSubjectAssignRequest"],
        ) =>
          apiFetch<components["schemas"]["ClassSubjectRead"]>(
            getAuthToken,
            `/classes/${classId}/subjects`,
            { method: "POST", body: JSON.stringify(payload) },
          ),
        setTeacher: (
          classId: string,
          subjectId: string,
          payload: components["schemas"]["ClassSubjectTeacherUpdate"],
        ) =>
          apiFetch<components["schemas"]["ClassSubjectRead"]>(
            getAuthToken,
            `/classes/${classId}/subjects/${subjectId}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          ),
        remove: (classId: string, subjectId: string) =>
          apiFetch<void>(
            getAuthToken,
            `/classes/${classId}/subjects/${subjectId}`,
            { method: "DELETE" },
          ),
      },
      /** Class-teacher sub-resource. */
      teachers: {
        list: (classId: string) =>
          apiFetch<components["schemas"]["ClassTeachersListResponse"]>(
            getAuthToken,
            `/classes/${classId}/teachers`,
          ),
        assign: (
          classId: string,
          payload: components["schemas"]["ClassTeacherAssignRequest"],
        ) =>
          apiFetch<components["schemas"]["ClassTeacherRead"]>(
            getAuthToken,
            `/classes/${classId}/teachers`,
            { method: "POST", body: JSON.stringify(payload) },
          ),
        remove: (classId: string, staffId: string) =>
          apiFetch<void>(
            getAuthToken,
            `/classes/${classId}/teachers/${staffId}`,
            { method: "DELETE" },
          ),
      },
    },
    enrollments: {
      create: (payload: components["schemas"]["EnrollmentCreate"]) =>
        apiFetch<components["schemas"]["EnrollmentRead"]>(
          getAuthToken,
          "/enrollments",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["EnrollmentRead"]>(
          getAuthToken,
          `/enrollments/${id}`,
        ),
      changeStatus: (
        id: string,
        payload: components["schemas"]["EnrollmentStatusUpdate"],
      ) =>
        apiFetch<components["schemas"]["EnrollmentRead"]>(
          getAuthToken,
          `/enrollments/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
    },
    attendance: {
      /** Batch save. Returns the full session with joined student names. */
      upsertSession: (
        payload: components["schemas"]["AttendanceSessionUpsertRequest"],
      ) =>
        apiFetch<components["schemas"]["AttendanceSessionRead"]>(
          getAuthToken,
          "/attendance/sessions",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      /** History — paginated summaries with per-status counts. */
      listSessions: (
        params: { classId?: string; term?: number; page?: number; size?: number } = {},
      ) =>
        apiFetch<components["schemas"]["AttendanceSessionsListResponse"]>(
          getAuthToken,
          `/attendance/sessions${buildQuery(params)}`,
        ),
      /** "Has today's roster already been saved?" — 404 → not yet. */
      lookupSession: (params: { classId: string; date: string }) =>
        apiFetch<components["schemas"]["AttendanceSessionRead"]>(
          getAuthToken,
          `/attendance/sessions/lookup${buildQuery(params)}`,
        ),
      getSession: (sessionId: string) =>
        apiFetch<components["schemas"]["AttendanceSessionRead"]>(
          getAuthToken,
          `/attendance/sessions/${sessionId}`,
        ),
    },
    staffAttendance: {
      upsertSession: (
        payload: components["schemas"]["StaffAttendanceSessionUpsertRequest"],
      ) =>
        apiFetch<components["schemas"]["StaffAttendanceSessionRead"]>(
          getAuthToken,
          "/staff-attendance/sessions",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      listSessions: (
        params: { division?: string; term?: number; page?: number; size?: number } = {},
      ) =>
        apiFetch<components["schemas"]["StaffAttendanceSessionsListResponse"]>(
          getAuthToken,
          `/staff-attendance/sessions${buildQuery(params)}`,
        ),
      lookupSession: (params: { division: string; date: string }) =>
        apiFetch<components["schemas"]["StaffAttendanceSessionRead"]>(
          getAuthToken,
          `/staff-attendance/sessions/lookup${buildQuery(params)}`,
        ),
      getSession: (sessionId: string) =>
        apiFetch<components["schemas"]["StaffAttendanceSessionRead"]>(
          getAuthToken,
          `/staff-attendance/sessions/${sessionId}`,
        ),
    },
    exams: {
      list: (
        params: {
          q?: string;
          academicYear?: string;
          term?: number;
          type?: "MidTerm" | "EndOfTerm";
          published?: boolean;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["ExamsListResponse"]>(
          getAuthToken,
          `/exams${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["ExamRead"]>(getAuthToken, `/exams/${id}`),
      create: (payload: components["schemas"]["ExamCreate"]) =>
        apiFetch<components["schemas"]["ExamRead"]>(getAuthToken, "/exams", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["ExamUpdate"]) =>
        apiFetch<components["schemas"]["ExamRead"]>(
          getAuthToken,
          `/exams/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      publish: (id: string) =>
        apiFetch<components["schemas"]["ExamRead"]>(
          getAuthToken,
          `/exams/${id}/publish`,
          { method: "POST" },
        ),
      unpublish: (id: string) =>
        apiFetch<components["schemas"]["ExamRead"]>(
          getAuthToken,
          `/exams/${id}/unpublish`,
          { method: "POST" },
        ),
      /** Nested sub-resource: score grid for (exam, class, subject). */
      scores: {
        get: (examId: string, params: { classId: string; subjectId: string }) =>
          apiFetch<components["schemas"]["ScoresGridResponse"]>(
            getAuthToken,
            `/exams/${examId}/scores${buildQuery(params)}`,
          ),
        upsert: (
          examId: string,
          payload: components["schemas"]["ScoresUpsertRequest"],
        ) =>
          apiFetch<components["schemas"]["ScoresGridResponse"]>(
            getAuthToken,
            `/exams/${examId}/scores`,
            { method: "PUT", body: JSON.stringify(payload) },
          ),
      },
    },
    lessonPlans: {
      list: (
        params: {
          teacherId?: string;
          status?: string;
          division?: string;
          classId?: string;
          term?: number;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["LessonPlansListResponse"]>(
          getAuthToken,
          `/lesson-plans${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["LessonPlanRead"]>(
          getAuthToken,
          `/lesson-plans/${id}`,
        ),
      create: (payload: components["schemas"]["LessonPlanCreate"]) =>
        apiFetch<components["schemas"]["LessonPlanRead"]>(
          getAuthToken,
          "/lesson-plans",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      update: (id: string, payload: components["schemas"]["LessonPlanUpdate"]) =>
        apiFetch<components["schemas"]["LessonPlanRead"]>(
          getAuthToken,
          `/lesson-plans/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      submit: (id: string) =>
        apiFetch<components["schemas"]["LessonPlanRead"]>(
          getAuthToken,
          `/lesson-plans/${id}/submit`,
          { method: "POST" },
        ),
      review: (
        id: string,
        payload: components["schemas"]["LessonPlanReviewRequest"],
      ) =>
        apiFetch<components["schemas"]["LessonPlanRead"]>(
          getAuthToken,
          `/lesson-plans/${id}/review`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
      delete: (id: string) =>
        apiFetch<void>(getAuthToken, `/lesson-plans/${id}`, {
          method: "DELETE",
        }),
    },
    schemes: {
      list: (
        params: {
          teacherId?: string;
          status?: string;
          division?: string;
          term?: number;
          academicYear?: string;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["SchemesListResponse"]>(
          getAuthToken,
          `/schemes${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["SchemeRead"]>(
          getAuthToken,
          `/schemes/${id}`,
        ),
      create: (payload: components["schemas"]["SchemeCreate"]) =>
        apiFetch<components["schemas"]["SchemeRead"]>(getAuthToken, "/schemes", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["SchemeUpdate"]) =>
        apiFetch<components["schemas"]["SchemeRead"]>(
          getAuthToken,
          `/schemes/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      submit: (id: string) =>
        apiFetch<components["schemas"]["SchemeRead"]>(
          getAuthToken,
          `/schemes/${id}/submit`,
          { method: "POST" },
        ),
      acknowledge: (
        id: string,
        payload: components["schemas"]["SchemeAcknowledgeRequest"],
      ) =>
        apiFetch<components["schemas"]["SchemeRead"]>(
          getAuthToken,
          `/schemes/${id}/acknowledge`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
      delete: (id: string) =>
        apiFetch<void>(getAuthToken, `/schemes/${id}`, { method: "DELETE" }),
    },
    assignments: {
      /** Paginated list. Parents MUST pass `forStudentIds` — ownership
       *  verified server-side; results are always published-only for
       *  parents. Staff scope: teacher defaults to own, Admin/Deputy
       *  can pass `teacherId` to narrow. */
      list: (
        params: {
          teacherId?: string;
          status?: string;
          classId?: string;
          forStudentIds?: string[];
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["AssignmentsListResponse"]>(
          getAuthToken,
          `/assignments${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["AssignmentRead"]>(
          getAuthToken,
          `/assignments/${id}`,
        ),
      create: (payload: components["schemas"]["AssignmentCreate"]) =>
        apiFetch<components["schemas"]["AssignmentRead"]>(
          getAuthToken,
          "/assignments",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      update: (id: string, payload: components["schemas"]["AssignmentUpdate"]) =>
        apiFetch<components["schemas"]["AssignmentRead"]>(
          getAuthToken,
          `/assignments/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      publish: (id: string) =>
        apiFetch<components["schemas"]["AssignmentRead"]>(
          getAuthToken,
          `/assignments/${id}/publish`,
          { method: "POST" },
        ),
      unpublish: (id: string) =>
        apiFetch<components["schemas"]["AssignmentRead"]>(
          getAuthToken,
          `/assignments/${id}/unpublish`,
          { method: "POST" },
        ),
      delete: (id: string) =>
        apiFetch<void>(getAuthToken, `/assignments/${id}`, {
          method: "DELETE",
        }),
    },
    leaveRequests: {
      list: (
        params: {
          staffId?: string;
          status?: string;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["LeaveRequestsListResponse"]>(
          getAuthToken,
          `/leave-requests${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["LeaveRequestRead"]>(
          getAuthToken,
          `/leave-requests/${id}`,
        ),
      create: (payload: components["schemas"]["LeaveRequestCreate"]) =>
        apiFetch<components["schemas"]["LeaveRequestRead"]>(
          getAuthToken,
          "/leave-requests",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      updateStatus: (
        id: string,
        payload: components["schemas"]["LeaveStatusUpdate"],
      ) =>
        apiFetch<components["schemas"]["LeaveRequestRead"]>(
          getAuthToken,
          `/leave-requests/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
    },
    promotions: {
      /** Season header for the school's current academic year. Returns
       *  `null` if no row exists yet. Any authenticated role. */
      getSeason: () =>
        apiFetch<components["schemas"]["SeasonRead"] | null>(
          getAuthToken,
          "/promotions/season",
        ),
      openSeason: (payload: components["schemas"]["SeasonOpenRequest"]) =>
        apiFetch<components["schemas"]["SeasonOpenResponse"]>(
          getAuthToken,
          "/promotions/season/open",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      closeSeason: () =>
        apiFetch<components["schemas"]["SeasonRead"]>(
          getAuthToken,
          "/promotions/season/close",
          { method: "POST" },
        ),
      /** Admin overview — every class in the school. */
      getOverview: () =>
        apiFetch<components["schemas"]["OverviewResponse"]>(
          getAuthToken,
          "/promotions/overview",
        ),
      /** DH queue — automatically scoped to the caller's division. */
      getDhQueue: () =>
        apiFetch<components["schemas"]["DeputyHeadQueueResponse"]>(
          getAuthToken,
          "/promotions/dh-queue",
        ),
      /** Teacher's own classes with submission status. */
      getTeacherClasses: () =>
        apiFetch<components["schemas"]["TeacherClassesResponse"]>(
          getAuthToken,
          "/promotions/teacher-classes",
        ),
      ensureSubmission: (
        payload: components["schemas"]["EnsureSubmissionRequest"],
      ) =>
        apiFetch<components["schemas"]["EnsureSubmissionResponse"]>(
          getAuthToken,
          "/promotions/submissions/ensure",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      getSubmission: (id: string) =>
        apiFetch<components["schemas"]["SubmissionDetail"]>(
          getAuthToken,
          `/promotions/submissions/${id}`,
        ),
      getSubmissionByClass: (classId: string) =>
        apiFetch<components["schemas"]["SubmissionDetail"] | null>(
          getAuthToken,
          `/promotions/submissions/by-class/${classId}`,
        ),
      saveDraft: (
        id: string,
        payload: components["schemas"]["SaveDraftRequest"],
      ) =>
        apiFetch<components["schemas"]["SubmissionRead"]>(
          getAuthToken,
          `/promotions/submissions/${id}/decisions`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      submit: (id: string, payload: components["schemas"]["SubmitListRequest"]) =>
        apiFetch<components["schemas"]["SubmissionRead"]>(
          getAuthToken,
          `/promotions/submissions/${id}/submit`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
      approve: (id: string) =>
        apiFetch<components["schemas"]["SubmissionRead"]>(
          getAuthToken,
          `/promotions/submissions/${id}/approve`,
          { method: "POST" },
        ),
      sendBack: (
        id: string,
        payload: components["schemas"]["SendBackRequest"],
      ) =>
        apiFetch<components["schemas"]["SubmissionRead"]>(
          getAuthToken,
          `/promotions/submissions/${id}/send-back`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
    },
  };
}

/**
 * Build a `?a=b&c=d` query string from a plain object.
 *
 * Omits keys whose value is `undefined`/`null`/empty-string — important
 * so `api.staff.list({})` hits `/staff` cleanly, not `/staff?q=` (which
 * the FastAPI side would parse as `q == ""` and short-circuit search).
 */
function buildQuery(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    // Arrays repeat the key: `?tag=a&tag=b`. FastAPI's `Query(list[str])`
    // parses this shape; a comma-joined string would arrive as one value.
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null || v === "") continue;
        pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
      }
      continue;
    }
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `?${pairs.join("&")}` : "";
}
