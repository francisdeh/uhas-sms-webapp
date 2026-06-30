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
  };
}
