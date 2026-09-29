import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const GET = handle(async () => {
  const user = await requireUser(undefined, { allowPasswordChange: true });
  return NextResponse.json({ user });
});
