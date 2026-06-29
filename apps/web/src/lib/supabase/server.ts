/**
 * Server-side Supabase client (Server Components, Server Actions, route handlers).
 *
 * Reads + writes the session cookie via Next's `cookies()` API. Each
 * call returns a fresh client because `cookies()` is request-scoped —
 * caching one globally would leak sessions across users.
 *
 * Use for:
 *   - Server Components that need the current user
 *   - Server Actions that mutate auth state (login, logout, password reset)
 *   - Route handlers (when we add /api/* endpoints in Phase 2)
 *
 * Do NOT use in the proxy — middleware has its own request/response
 * shape; use `src/lib/supabase/middleware.ts` there.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components, `cookieStore.set` throws — that's
          // expected and benign (Next disallows mutating cookies from
          // a render path). Swallow the error so we don't crash reads.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Setting cookies from a Server Component is a no-op;
            // Server Actions and route handlers handle it correctly.
          }
        },
      },
    },
  );
}
