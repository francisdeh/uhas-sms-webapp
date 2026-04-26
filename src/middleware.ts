import { NextRequest, NextResponse } from "next/server";

const ROLE_REDIRECTS: Record<string, string> = {
  Admin: "/admin",
  DeputyHead: "/deputy-head",
  HOD: "/hod",
  Teacher: "/teacher",
  Parent: "/parent",
};

const PUBLIC_PATHS = ["/login", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Read session cookie set by the login Server Action
  const role = request.cookies.get("session_role")?.value;
  const uid = request.cookies.get("session_uid")?.value;

  // No session → redirect to login
  if (!uid || !role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const dashboardBase = ROLE_REDIRECTS[role];

  // Redirect root to role dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL(dashboardBase ?? "/login", request.url));
  }

  // Block cross-role access (e.g. a Teacher hitting /admin)
  const isAccessingOtherDashboard = Object.values(ROLE_REDIRECTS).some(
    (base) => pathname.startsWith(base) && base !== dashboardBase
  );

  if (isAccessingOtherDashboard) {
    return NextResponse.redirect(new URL(dashboardBase ?? "/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
