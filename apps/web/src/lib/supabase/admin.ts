/**
 * Server-side Supabase admin client. Holds the service_role key so it
 * bypasses RLS — every caller is responsible for its own authorization.
 *
 * Use ONLY in Server Actions / route handlers that have already verified
 * the caller's privilege (typically Admin). Never expose to the browser.
 *
 * The client is constructed lazily so importing this module doesn't crash
 * at boot when SUPABASE_SERVICE_ROLE_KEY is unset (e.g. local dev that
 * doesn't need admin ops).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
