/**
 * API client for Server Components + Route Handlers.
 *
 * Reads the JWT from the server-side Supabase session (cookies via
 * Next's `cookies()` API). Each call constructs a fresh client because
 * `cookies()` is request-scoped — a module-level singleton would
 * leak sessions across users.
 *
 * Usage in a Server Component:
 *
 *     import { getApi } from "@/lib/api/server";
 *
 *     export default async function Page() {
 *       const api = await getApi();
 *       const school = await api.school.get();
 *       return <SchoolView data={school} />;
 *     }
 */

import "server-only";

import { createApiClient, type ApiClient } from "@/lib/api/client";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export async function getApi(): Promise<ApiClient> {
  const supabase = await createServerSupabaseClient();
  return createApiClient(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  });
}

export { ApiError } from "@/lib/api/client";
