import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import type { NextRequest } from "next/server";
import { hashPassword, startSession, usersCollection, type UserDoc } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { clearSsoState, readSsoState, redirectToPath, ssoConfig, ssoErrorPage, verifyPortalToken } from "@/lib/sso";

/** The TCG Portal sends people here with a one-minute token; a valid one starts a normal session. */
export async function GET(req: NextRequest) {
  if (!ssoConfig()) return ssoErrorPage("Portal sign-in isn't switched on for this app.", 404);

  const params = req.nextUrl.searchParams;
  const state = readSsoState(req, params.get("state"));
  if (!state) return ssoErrorPage("This sign-in link has expired or was opened in a different browser.");

  const identity = await verifyPortalToken(params.get("token"));
  if (!identity) return ssoErrorPage("The sign-in from the TCG Portal couldn't be verified. It may have expired.");

  const users = await usersCollection();
  let user = await users.findOne({ email: identity.email });
  if (user && !user.active) {
    await logAudit(identity.email, "login_failed", { reason: "inactive", via: "portal" });
    return ssoErrorPage("Your Format Assist account has been deactivated. Ask a Format Assist admin to reactivate it.");
  }

  const now = new Date();
  if (!user) {
    // First visit from the portal: the portal decides who may come in, so create a basic account.
    const doc: UserDoc = {
      _id: new ObjectId(),
      email: identity.email,
      name: identity.name,
      role: "user",
      // Passwords live in the portal; this one can't be used to sign in.
      passwordHash: await hashPassword(randomUUID()),
      mustChangePassword: false,
      active: true,
      sessionVersion: 0,
      createdBy: "portal",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    await users.insertOne(doc);
    await logAudit(identity.email, "user_created", { email: identity.email, role: "user", via: "portal" });
    user = doc;
  } else {
    await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, mustChangePassword: false } });
    user = { ...user, mustChangePassword: false };
  }

  await startSession(user);
  await logAudit(identity.email, "login", { via: "portal" });

  const res = redirectToPath(state.next);
  clearSsoState(res, state.cookie);
  return res;
}
