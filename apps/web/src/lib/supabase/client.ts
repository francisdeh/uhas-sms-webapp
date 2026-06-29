/**
 * Browser-side Supabase client.
 *
 * Use this in Client Components for things that have to run in the
 * browser — e.g. listening to auth state changes, calling
 * `signInWithPassword` from a form handler, real-time subscriptions.
 *
 * For server-side reads (Server Components, Server Actions, route
 * handlers, proxy) use `src/lib/supabase/server.ts` instead — that
 * one reads/writes the session cookie via Next's `cookies()` API.
 *
 * Cookies are auto-managed by @supabase/ssr; we don't construct names
 * or values ourselves anywhere.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
