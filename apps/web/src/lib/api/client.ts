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
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.length ? `?${pairs.join("&")}` : "";
}
