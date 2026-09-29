import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getAiUsageSummary } from "@/lib/ai-usage";

export const GET = handle(async (req: Request) => {
  await requireUser(["super_admin", "admin"]);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 1), 365);
  return NextResponse.json({ days, rows: await getAiUsageSummary(days) });
});
