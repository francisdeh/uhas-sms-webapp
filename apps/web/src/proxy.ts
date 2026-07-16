/**
 * Role-based routing guard — runs on every navigation that matches `config.matcher`.
 *
 * Reads the Supabase session via @supabase/ssr (NOT the legacy
 * session_* cookies — those are removed in Phase 1 PR #8). The
 * @supabase/ssr middleware adapter refreshes near-expired sessions
 * transparently and writes the refreshed cookies into the response,
 * so we get session continuity for free.
 *
 * Routing rules:
 *   - Public paths (login, reset, password change, /api/health) pass through
 *   - Unauthenticated users hitting protected paths → /login
 *   - Authenticated users hitting "/" → redirected to their role dashboard
 *   - Authenticated users hitting another role's dashboard → bounced to their own
 *
 * Role is read from `user.app_metadata.role`, populated by the seed
 * script + admin user-creation flows. NEVER read from
 * `user.user_metadata` — that's user-writable and untrusted.
 */

import { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const ROLE_DASHBOARDS: Record<string, string> = {
  Admin: "/admin",
  DeputyHead: "/deputy-head",
  Teacher: "/teacher",
  Parent: "/parent",
  Accountant: "/accountant", // Phase 5 — segment doesn't exist yet but route guard ready
};

const PUBLIC_PATHS = ["/login", "/reset-password", "/change-password", "/api"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always run the Supabase session refresh — even on public paths.
  // That way a soon-to-expire session gets refreshed during a /login
  // visit instead of expiring mid-form-submit.
  const { supabaseResponse, user, needsMfa } = await updateSession(request);

  if (isPublic(pathname)) {
    return supabaseResponse;
  }

  // No session → bounce to login, preserving the original target.
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role comes from app_metadata, which is server-set (privileged).
  // user_metadata is user-writable and must never be read here.
  const role = (user.app_metadata?.role as string | undefined) ?? null;
  const dashboardBase = role ? ROLE_DASHBOARDS[role] : null;

  // Authenticated but no role → account not fully set up. Bounce to
  // login with a hint so the UI can show a clear "contact admin" message.
  if (!dashboardBase) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "no_role");
    return NextResponse.redirect(loginUrl);
  }

  // 2FA step-up gate: a user with a verified factor who hasn't cleared
  // it this session must finish at /verify-2fa before any dashboard.
  // This is a UI-navigation gate ONLY — it stops the Next.js dashboard
  // routes, not the FastAPI backend. A client holding a still-valid
  // aal1 bearer token can call any apps/api endpoint directly; FastAPI
  // never reads the JWT's `aal`/`amr` claims today, so it can't tell
  // an unenrolled account from one that skipped step-up. Real API-layer
  // enforcement needs a persisted "has this account enrolled" signal
  // (there isn't one — enrollment status is only ever derived live via
  // the Supabase client SDK) and is tracked as separate follow-up work,
  // not implemented here. Exempt /verify-2fa itself (else it redirects
  // to itself) and /change-password (a first-login user hasn't enrolled
  // yet, but keep it reachable regardless).
  if (needsMfa && pathname !== "/verify-2fa") {
    return NextResponse.redirect(new URL("/verify-2fa", request.url));
  }

  // Root → role dashboard.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(dashboardBase, request.url));
  }

  // Block cross-role access.
  const accessingOtherDashboard = Object.values(ROLE_DASHBOARDS).some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  ) && !(pathname === dashboardBase || pathname.startsWith(`${dashboardBase}/`));

  if (accessingOtherDashboard) {
    return NextResponse.redirect(new URL(dashboardBase, request.url));
  }

  return supabaseResponse;
}

export const config = {
  // Exclude Next internals + static assets. Everything else (pages,
  // server actions, route handlers) goes through the proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
