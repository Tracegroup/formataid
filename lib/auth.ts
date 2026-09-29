import "server-only";
import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type Role } from "@/lib/session";

export type { Role } from "@/lib/session";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
  active: boolean;
  sessionVersion: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export const MIN_PASSWORD_LENGTH = 10;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

let emailIndexEnsured = false;

export async function usersCollection() {
  const db = await getDb();
  const col = db.collection<UserDoc>("users");
  if (!emailIndexEnsured) {
    emailIndexEnsured = true;
    col.createIndex({ email: 1 }, { unique: true }).catch(() => {});
  }
  return col;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// No 0/O/1/l/I so the password can be read out or typed without confusion.
const OTP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function generateOneTimePassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  return out;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain both letters and numbers.";
  return null;
}

export async function startSession(user: UserDoc): Promise<void> {
  const token = await signSession({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    mcp: user.mustChangePassword,
    ver: user.sessionVersion ?? 0,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Current user, re-validated against the database (so deactivation and password
 * resets take effect immediately), or null.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || !ObjectId.isValid(session.sub)) return null;
  const users = await usersCollection();
  const user = await users.findOne({ _id: new ObjectId(session.sub) }, { projection: { passwordHash: 0 } });
  if (!user || !user.active || (user.sessionVersion ?? 0) !== session.ver) return null;
  return { id: user._id.toString(), email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword };
}

/** For API routes: throws 401/403 HttpErrors. */
export async function requireUser(roles?: Role[], opts: { allowPasswordChange?: boolean } = {}): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  if (user.mustChangePassword && !opts.allowPasswordChange) throw new HttpError(403, "Please change your one-time password first.");
  if (roles && !roles.includes(user.role)) throw new HttpError(403, "You don't have permission to do that.");
  return user;
}

/** For server-component pages: redirects instead of throwing. */
export async function requirePageUser(roles?: Role[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/");
  return user;
}

export function isAdmin(user: Pick<AuthUser, "role">): boolean {
  return user.role === "super_admin" || user.role === "admin";
}

// --- Login throttling -------------------------------------------------------

const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60 * 1000;

/** Minutes until this email may try again (0 = not locked). */
export async function loginLockedFor(email: string): Promise<number> {
  const db = await getDb();
  const doc = await db.collection("loginAttempts").findOne({ email });
  if (!doc || doc.count < MAX_FAILURES) return 0;
  const remaining = doc.firstAt.getTime() + WINDOW_MS - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

export async function recordLoginFailure(email: string): Promise<void> {
  const db = await getDb();
  const col = db.collection("loginAttempts");
  col.createIndex({ firstAt: 1 }, { expireAfterSeconds: WINDOW_MS / 1000 }).catch(() => {});
  const now = new Date();
  const doc = await col.findOne({ email });
  if (!doc || now.getTime() - doc.firstAt.getTime() > WINDOW_MS) {
    await col.updateOne({ email }, { $set: { email, count: 1, firstAt: now } }, { upsert: true });
  } else {
    await col.updateOne({ email }, { $inc: { count: 1 } });
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  const db = await getDb();
  await db.collection("loginAttempts").deleteOne({ email });
}
