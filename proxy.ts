import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { ssoConfig, startSso, type SsoConfig } from "@/lib/sso";

// Optimistic redirect only — every API route and page re-checks the session
// (and the user's active status) against the database.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const PASSWORD_CHANGE_PATHS = ["/change-password", "/api/auth/change-password", "/api/auth/logout", "/api/me"];

/** Sign-in through the TCG Portal: this app has no login form or passwords of its own. */
async function ssoProxy(req: NextRequest, sso: SsoConfig) {
  const { pathname, search, searchParams } = req.nextUrl;
  if (pathname === "/api/sso/callback") return NextResponse.next();
  // Always restart at /login, even with a cookie: it may belong to a user the database no longer accepts.
  if (pathname === "/login") return startSso(req, sso, searchParams.get("next") ?? "/");
  if (pathname === "/change-password") return NextResponse.redirect(`${sso.portalUrl}/change-password`);
  if (pathname === "/api/auth/login" || pathname === "/api/auth/change-password") {
    return NextResponse.json({ error: "Sign in through the TCG Portal." }, { status: 404 });
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  return startSso(req, sso, pathname + search);
}

export async function proxy(req: NextRequest) {
  const sso = ssoConfig();
  if (sso) return ssoProxy(req, sso);

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session.mcp && !PASSWORD_CHANGE_PATHS.includes(pathname)) {
    if (isApi) return NextResponse.json({ error: "Please change your one-time password first." }, { status: 403 });
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
