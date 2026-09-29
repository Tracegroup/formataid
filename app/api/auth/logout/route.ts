import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { endSession, getCurrentUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const POST = handle(async () => {
  const user = await getCurrentUser();
  await endSession();
  if (user) await logAudit(user.email, "logout");
  return NextResponse.json({ ok: true });
});
