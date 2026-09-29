// Edge-safe session helpers (jose only) — shared by proxy.ts and server code.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "fa_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type Role = "super_admin" | "admin" | "user";

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Must change the one-time password before using the app. */
  mcp: boolean;
  /** Bumped on password reset/deactivation so older cookies stop working. */
  ver: number;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
