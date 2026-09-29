import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import {
  HttpError,
  checkPassword,
  clearLoginFailures,
  loginLockedFor,
  normalizeEmail,
  recordLoginFailure,
  startSession,
  usersCollection,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = "$2b$12$e0JhEH2Wyl/j1u/PuOtck./p3sUo0t.swAKERuPVp.sy4hq1UeKoC";

export const POST = handle(async (req: Request) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");

  const lockedMinutes = await loginLockedFor(email);
  if (lockedMinutes) throw new HttpError(429, `Too many failed attempts. Try again in ${lockedMinutes} minute(s).`);

  const users = await usersCollection();
  const user = await users.findOne({ email });
  const ok = await checkPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) {
    await recordLoginFailure(email);
    await logAudit(email, "login_failed", { reason: !user ? "unknown_email" : !ok ? "bad_password" : "inactive" });
    throw new HttpError(401, user && ok && !user.active ? "This account has been deactivated." : "Incorrect email or password.");
  }

  await clearLoginFailures(email);
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await startSession(user);
  await logAudit(email, "login");
  return NextResponse.json({ ok: true, mustChangePassword: user.mustChangePassword });
});
