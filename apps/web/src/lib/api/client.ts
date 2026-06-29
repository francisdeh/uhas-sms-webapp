/**
 * Typed API client for the FastAPI backend.
 *
 * Pattern: thin namespace per feature domain. Each call:
 *   1. Uses types from `@/types/api` so request/response shapes
 *      come straight from the FastAPI Pydantic schemas.
 *   2. Wraps `fetch` with the `Authorization: Bearer …` header
 *      (Supabase JWT, attached once Phase 1 ships).
 *   3. Throws on non-2xx so TanStack Query treats it as an error.
 *
 * Domain hooks (`features/<x>/queries.ts` + `mutations.ts`) call into
 * this namespace — they don't `fetch` directly.
 *
 * See v2/UHAS_Backend_Architecture_v1.1.md §9 + §10.
 */

import type { components } from "@/types/api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Get the current user's Supabase JWT.
 *
 * Stub for now — Phase 1 wires this to `@supabase/ssr` to read the
 * session cookie. Until then, every call goes through unauthenticated.
 */
async function getAuthToken(): Promise<string | null> {
  return null;
}

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

  return res.json() as Promise<T>;
}

// ── Domain namespaces ────────────────────────────────────────────────────────
// One per feature folder in apps/api/app/features/. New domains get added
// here as their FastAPI routers land in Phase 2.

export const api = {
  health: {
    get: () =>
      apiFetch<components["schemas"]["HealthResponse"]>("/health"),
  },
};
