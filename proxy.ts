import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Optimistic redirect only — every API route and page re-checks the session
// (and the user's active status) against the database.
const PUBLIC_PATHS = ["/login", "/api/auth/login"];
const PASSWORD_CHANGE_PATHS = ["/change-password", "/api/auth/change-password", "/api/auth/logout", "/api/me"];

export async function proxy(req: NextRequest) {
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
