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

/**
 * Like `apiFetch`, but for binary responses (PDFs, etc.) — `apiFetch`
 * always calls `res.json()` on success, which throws on a non-JSON
 * body. `fetch` follows redirects by default, so this transparently
 * reads the final response (e.g. a Storage signed-URL redirect).
 */
async function apiFetchBlob(getAuthToken: TokenGetter, path: string): Promise<Blob> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    throw new ApiError(res.status, "http_error", `HTTP ${res.status}`);
  }
  return res.blob();
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
      /** Cosmetic-only read for the login page — no session required. */
      getPublic: () =>
        apiFetch<components["schemas"]["SchoolPublicRead"]>(getAuthToken, "/school/public"),
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
      /** Every student linked to this guardian. Parent callers can only
       *  pass their OWN linked guardian id — server 403s otherwise. */
      children: (id: string) =>
        apiFetch<components["schemas"]["GuardianChildrenResponse"]>(
          getAuthToken,
          `/guardians/${id}/children`,
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
      /** First linked guardian, or null if none. */
      guardian: (studentId: string) =>
        apiFetch<components["schemas"]["StudentGuardianRead"] | null>(
          getAuthToken,
          `/students/${studentId}/guardian`,
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
    notifications: {
      /** Compound bell response — top-10 items + unread count. Poll
       *  target for the bell dropdown. */
      getBell: () =>
        apiFetch<components["schemas"]["BellData"]>(
          getAuthToken,
          "/notifications/bell",
        ),
      /** Marks every unread notification for the caller as read.
       *  Idempotent; used when the bell dropdown opens. */
      markAllRead: () =>
        apiFetch<components["schemas"]["MarkReadResponse"]>(
          getAuthToken,
          "/notifications/mark-all-read",
          { method: "POST" },
        ),
      /** Marks specific ids read; foreign ids are silently dropped
       *  server-side. */
      markRead: (payload: components["schemas"]["MarkReadRequest"]) =>
        apiFetch<components["schemas"]["MarkReadResponse"]>(
          getAuthToken,
          "/notifications/mark-read",
          { method: "POST", body: JSON.stringify(payload) },
        ),
    },
    announcements: {
      /** Role-filtered list. Server infers scope from the JWT — the
       *  client doesn't get to pass a role. */
      list: (params: { page?: number; size?: number } = {}) =>
        apiFetch<components["schemas"]["AnnouncementsListResponse"]>(
          getAuthToken,
          `/announcements${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["AnnouncementRead"]>(
          getAuthToken,
          `/announcements/${id}`,
        ),
      create: (payload: components["schemas"]["AnnouncementCreate"]) =>
        apiFetch<components["schemas"]["AnnouncementRead"]>(
          getAuthToken,
          "/announcements",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      delete: (id: string) =>
        apiFetch<void>(getAuthToken, `/announcements/${id}`, {
          method: "DELETE",
        }),
    },
    calendar: {
      list: (params: { page?: number; size?: number } = {}) =>
        apiFetch<components["schemas"]["CalendarEventsListResponse"]>(
          getAuthToken,
          `/calendar${buildQuery(params)}`,
        ),
      create: (payload: components["schemas"]["CalendarEventCreate"]) =>
        apiFetch<components["schemas"]["CalendarEventRead"]>(
          getAuthToken,
          "/calendar",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      delete: (id: string) =>
        apiFetch<void>(getAuthToken, `/calendar/${id}`, { method: "DELETE" }),
    },
    reports: {
      /** Admin overview — every counter on the school dashboard. */
      getSchoolStats: () =>
        apiFetch<components["schemas"]["SchoolStats"]>(
          getAuthToken,
          "/reports/school",
        ),
      /** Deputy dashboard for the given division. Admin can also call.
       *  A Deputy asking for a division other than their own gets 403. */
      getDivisionStats: (division: string) =>
        apiFetch<components["schemas"]["DivisionStats"]>(
          getAuthToken,
          `/reports/division/${division}`,
        ),
      /** Teacher dashboard — subject averages + last-7 attendance for the
       *  given class. Admin, division Deputy, and class/subject teachers
       *  can call; anyone else gets 403. */
      getClassStats: (classId: string) =>
        apiFetch<components["schemas"]["ClassStats"]>(
          getAuthToken,
          `/reports/class/${classId}`,
        ),
      /** PSC census-style school report. Admin only. */
      getPscReport: () =>
        apiFetch<components["schemas"]["PscReportData"]>(
          getAuthToken,
          "/reports/psc",
        ),
    },
    auditLog: {
      /** Read-only, Admin only. Filters are all optional; `action`
       *  matches the closed set of `AuditAction` values. */
      list: (
        params: {
          action?: string;
          from?: string;
          to?: string;
          page?: number;
          size?: number;
        } = {},
      ) =>
        apiFetch<components["schemas"]["AuditEventsListResponse"]>(
          getAuthToken,
          `/audit-log${buildQuery(params)}`,
        ),
    },
    appointments: {
      /** Own list — Parent sees their requests, Teacher sees their
       *  inbox (pending first). Server infers scope from the JWT. */
      list: (params: { page?: number; size?: number } = {}) =>
        apiFetch<components["schemas"]["AppointmentsListResponse"]>(
          getAuthToken,
          `/appointments${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["AppointmentRead"]>(
          getAuthToken,
          `/appointments/${id}`,
        ),
      /** Powers the parent-side teacher picker. Only Parents (for their
       *  own children) or Admin can call. */
      teachersForStudent: (studentId: string) =>
        apiFetch<components["schemas"]["TeacherOptionsResponse"]>(
          getAuthToken,
          `/appointments/teachers-for-student${buildQuery({ studentId })}`,
        ),
      create: (payload: components["schemas"]["AppointmentCreate"]) =>
        apiFetch<components["schemas"]["AppointmentRead"]>(
          getAuthToken,
          "/appointments",
          { method: "POST", body: JSON.stringify(payload) },
        ),
      respond: (
        id: string,
        payload: components["schemas"]["AppointmentRespond"],
      ) =>
        apiFetch<components["schemas"]["AppointmentRead"]>(
          getAuthToken,
          `/appointments/${id}/respond`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
      cancel: (id: string) =>
        apiFetch<void>(
          getAuthToken,
          `/appointments/${id}/cancel`,
          { method: "POST" },
        ),
    },
    me: {
      /** Compose the caller's SessionUser shape — replaces the Drizzle
       *  join in the legacy `getSessionUser()` helper. Called on every
       *  dashboard render. */
      get: () =>
        apiFetch<components["schemas"]["MeRead"]>(getAuthToken, "/me"),
      /** Self-service update of the caller's own display name + phone. */
      update: (payload: components["schemas"]["MeUpdate"]) =>
        apiFetch<components["schemas"]["MeRead"]>(getAuthToken, "/me", {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
    },
    shell: {
      /** Sidebar badge counts (today: lesson-plans-pending-review). */
      navBadges: () =>
        apiFetch<components["schemas"]["NavBadges"]>(
          getAuthToken,
          "/shell/nav-badges",
        ),
    },
    search: {
      /** ⌘K palette hits across students/staff/classes. Server enforces
       *  role-scoping; a q shorter than 2 chars returns empty payload
       *  without hitting the DB. */
      global: (q: string) =>
        apiFetch<components["schemas"]["SearchResults"]>(
          getAuthToken,
          `/search${buildQuery({ q })}`,
        ),
    },
    classSubjects: {
      /** Which classes teach a given subject? */
      listBySubject: (subjectId: string) =>
        apiFetch<components["schemas"]["ClassSubjectLookupResponse"]>(
          getAuthToken,
          `/class-subjects${buildQuery({ subjectId })}`,
        ),
      /** Which class-subjects does a given teacher hold? Teacher callers
       *  can only pass their OWN teacherId — server 403s otherwise. */
      listByTeacher: (teacherId: string) =>
        apiFetch<components["schemas"]["ClassSubjectLookupResponse"]>(
          getAuthToken,
          `/class-subjects${buildQuery({ teacherId })}`,
        ),
    },
    users: {
      /** Admin user management — Admin only. */
      list: (params: { q?: string; page?: number; size?: number } = {}) =>
        apiFetch<components["schemas"]["UsersListResponse"]>(
          getAuthToken,
          `/users${buildQuery(params)}`,
        ),
      get: (id: string) =>
        apiFetch<components["schemas"]["UserRead"]>(
          getAuthToken,
          `/users/${id}`,
        ),
      create: (payload: components["schemas"]["UserCreate"]) =>
        apiFetch<components["schemas"]["UserRead"]>(getAuthToken, "/users", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      update: (id: string, payload: components["schemas"]["UserUpdate"]) =>
        apiFetch<components["schemas"]["UserRead"]>(
          getAuthToken,
          `/users/${id}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
      deactivate: (id: string) =>
        apiFetch<components["schemas"]["UserRead"]>(
          getAuthToken,
          `/users/${id}/deactivate`,
          { method: "POST" },
        ),
      activate: (id: string) =>
        apiFetch<components["schemas"]["UserRead"]>(
          getAuthToken,
          `/users/${id}/activate`,
          { method: "POST" },
        ),
    },
    classReports: {
      /** List class-report submissions for an exam. Admin sees all,
       *  Deputy Head sees own-division, Teacher sees own classes. */
      list: (examId: string) =>
        apiFetch<components["schemas"]["ClassReportListResponse"]>(
          getAuthToken,
          `/exams/${examId}/class-reports`,
        ),
      /** Get one class report (with per-student remarks). */
      get: (examId: string, classId: string) =>
        apiFetch<components["schemas"]["ClassReportRead"]>(
          getAuthToken,
          `/exams/${examId}/class-reports/${classId}`,
        ),
      /** Upsert draft — class teacher only. Remarks payload is
       *  authoritative: anything not in the array is deleted. */
      saveDraft: (
        examId: string,
        classId: string,
        payload: components["schemas"]["ClassReportUpsertRequest"],
      ) =>
        apiFetch<components["schemas"]["ClassReportRead"]>(
          getAuthToken,
          `/exams/${examId}/class-reports/${classId}/draft`,
          { method: "PUT", body: JSON.stringify(payload) },
        ),
      /** Transition Draft → Submitted. Idempotent on Submitted. */
      submit: (examId: string, classId: string) =>
        apiFetch<components["schemas"]["ClassReportRead"]>(
          getAuthToken,
          `/exams/${examId}/class-reports/${classId}/submit`,
          { method: "POST" },
        ),
      /** Update the HOS comment after submission — Deputy/Admin only.
       *  Writes an audit row. */
      updateHosComment: (
        examId: string,
        classId: string,
        payload: components["schemas"]["HosCommentUpdate"],
      ) =>
        apiFetch<components["schemas"]["ClassReportRead"]>(
          getAuthToken,
          `/exams/${examId}/class-reports/${classId}/hos-comment`,
          { method: "PATCH", body: JSON.stringify(payload) },
        ),
    },
    studentViews: {
      /** Assembled report card for one student, one exam. */
      reportCard: (studentId: string, examId: string) =>
        apiFetch<components["schemas"]["ReportCardResponse"]>(
          getAuthToken,
          `/students/${studentId}/report-card${buildQuery({ examId })}`,
        ),
      /** Real PDF of one student's report card, one exam. */
      reportCardPdf: (studentId: string, examId: string) =>
        apiFetchBlob(
          getAuthToken,
          `/students/${studentId}/report-card/pdf${buildQuery({ examId })}`,
        ),
      /** Aggregate present/absent/late/excused counts for a date range. */
      attendanceSummary: (
        studentId: string,
        params: { termStart: string; termEnd: string },
      ) =>
        apiFetch<components["schemas"]["StudentAttendanceSummary"]>(
          getAuthToken,
          `/students/${studentId}/attendance-summary${buildQuery(params)}`,
        ),
      /** Per-day status entries (omits days with no session). */
      attendanceCalendar: (
        studentId: string,
        params: { termStart: string; termEnd: string },
      ) =>
        apiFetch<components["schemas"]["StudentAttendanceCalendarEntry"][]>(
          getAuthToken,
          `/students/${studentId}/attendance-calendar${buildQuery(params)}`,
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
