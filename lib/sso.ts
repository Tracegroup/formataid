// Sign-in through the TCG Portal. Edge-safe (jose only) — shared by proxy.ts and the callback route.
//
// With SSO_PORTAL_URL, SSO_APP_SLUG and SSO_PUBLIC_JWK set, the portal is the only way in:
// a visitor without a session is sent to the portal, which sends them back to
// /api/sso/callback with a one-minute token that only this app accepts.
import { importJWK, jwtVerify, type JWK } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const ISSUER = "tcg-portal";
const STATE_COOKIE_PREFIX = "sso_state_";
const STATE_RE = /^[A-Za-z0-9-]{16,64}$/;
const STATE_TTL_SECONDS = 600;

export interface SsoConfig {
  portalUrl: string;
  slug: string;
}

/** null = SSO is off and the app's own login form is used. */
export function ssoConfig(): SsoConfig | null {
  const portalUrl = process.env.SSO_PORTAL_URL?.trim().replace(/\/+$/, "");
  const slug = process.env.SSO_APP_SLUG?.trim();
  return portalUrl && slug ? { portalUrl, slug } : null;
}

export interface PortalIdentity {
  email: string;
  name: string;
}

let cachedKey: ReturnType<typeof importJWK> | undefined;

/** Who the portal says this is, or null if the token is forged, expired or meant for another app. */
export async function verifyPortalToken(token: string | null | undefined): Promise<PortalIdentity | null> {
  const sso = ssoConfig();
  const raw = process.env.SSO_PUBLIC_JWK;
  if (!token || !sso || !raw) return null;
  try {
    cachedKey ??= importJWK(JSON.parse(raw) as JWK, "EdDSA");
    const { payload } = await jwtVerify(token, await cachedKey, { issuer: ISSUER, audience: sso.slug, algorithms: ["EdDSA"] });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email) return null;
    return { email, name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : email };
  } catch {
    return null;
  }
}

/** Only same-site relative paths are followed after sign-in. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

/**
 * Sends the visitor to the portal to sign in. The page they wanted is kept in a cookie
 * named after a fresh random state, so only the browser that started a sign-in can finish it.
 */
export function startSso(req: NextRequest, sso: SsoConfig, next: string): NextResponse {
  const state = crypto.randomUUID();
  const url = new URL("/sso/authorize", sso.portalUrl);
  url.searchParams.set("app", sso.slug);
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE_PREFIX + state, safeNextPath(next), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/sso",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}

/** The page this browser asked for when it started the sign-in `state`, or null if it didn't start one. */
export function readSsoState(req: NextRequest, state: string | null): { cookie: string; next: string } | null {
  if (!state || !STATE_RE.test(state)) return null;
  const cookie = STATE_COOKIE_PREFIX + state;
  const value = req.cookies.get(cookie)?.value;
  return value === undefined ? null : { cookie, next: safeNextPath(value) };
}

/**
 * Redirect to a path on this site. The Location is left relative on purpose: behind a reverse
 * proxy a route handler sees its internal address (http://localhost:3000), so an absolute URL
 * built from the request would send the browser there.
 */
export function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: safeNextPath(path), "Cache-Control": "no-store" } });
}

export function clearSsoState(res: NextResponse, cookie: string): void {
  res.cookies.set(cookie, "", { path: "/api/sso", maxAge: 0 });
}

export function portalLogoutUrl(sso: SsoConfig): string {
  return `${sso.portalUrl}/logout`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A plain page for a sign-in that couldn't be completed, with a way to try again. */
export function ssoErrorPage(message: string, status = 403): NextResponse {
  const sso = ssoConfig();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign-in problem</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f5f7;color:#1f2937;font:15px/1.5 system-ui,sans-serif}main{max-width:26rem;margin:1rem;padding:2rem;background:#fff;border:1px solid #e5e7eb;border-radius:12px;text-align:center}h1{font-size:1.15rem;margin:0 0 .5rem}p{margin:0 0 1.25rem;color:#4b5563}a{color:#1B3566;font-weight:600;margin:0 .5rem}</style></head>
<body><main><h1>We couldn&rsquo;t sign you in</h1><p>${esc(message)}</p><a href="/">Try again</a>${sso ? `<a href="${esc(sso.portalUrl)}">TCG Portal</a>` : ""}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
