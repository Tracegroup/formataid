import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { endSession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { portalLogoutUrl, ssoConfig } from "@/lib/sso";

export const POST = handle(async () => {
  const user = await getCurrentUser();
  await endSession();
  if (user) await logAudit(user.email, "logout");
  const sso = ssoConfig();
  // With portal sign-in, also sign out of the portal — otherwise /login would sign straight back in.
  return NextResponse.json({ ok: true, redirect: sso ? portalLogoutUrl(sso) : "/login" });
});
