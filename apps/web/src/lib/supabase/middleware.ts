/**
 * Supabase client for Next.js middleware (the `proxy.ts` file).
 *
 * Different from server.ts because middleware runs in a NextRequest →
 * NextResponse pipeline and must propagate cookie writes back via the
 * response. @supabase/ssr handles the refresh logic internally — we
 * just give it the cookie adapter, ask `auth.getUser()`, and return
 * both the user and the (possibly-modified) response.
 *
 * Calling this on every middleware-handled request is the recommended
 * Supabase pattern — it transparently refreshes a near-expired session.
 */

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Important: write cookies to BOTH the request (so subsequent
          // reads inside this middleware see them) and the response (so
          // the browser sees them) — Supabase's own pattern from their
          // Next.js SSR guide.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Critical: call getUser() to trigger the refresh-if-needed flow and
  // populate app_metadata.role + app_metadata.school_id for the proxy
  // to read. Don't reach into the response cookies here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Step-up need: a user with a verified TOTP factor who hasn't cleared
  // it this session reads as currentLevel 'aal1' / nextLevel 'aal2'. The
  // proxy uses this to force them through /verify-2fa before any
  // dashboard. Only computed when authenticated — anon requests skip it.
  let needsMfa = false;
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    needsMfa = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";
  }

  return { supabaseResponse, user, needsMfa };
}
