/**
 * API client for Client Components.
 *
 * Reads the JWT from the browser-side Supabase session (managed by
 * @supabase/ssr cookies). Import this in components marked
 * `"use client"`:
 *
 *     import { api } from "@/lib/api/browser";
 *     await api.school.patch({ motto: "New motto" });
 *
 * Server Components / Route Handlers should import from
 * `@/lib/api/server` instead — that one reads the session via the
 * server-side Supabase client.
 */

import { createApiClient } from "@/lib/api/client";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

const supabase = createBrowserClient();

async function getBrowserAuthToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export const api = createApiClient(getBrowserAuthToken);

export { ApiError } from "@/lib/api/client";
