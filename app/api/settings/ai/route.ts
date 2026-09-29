import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { getAiConfig, isAiConfig, saveAiConfig, type AiConfig } from "@/lib/ai-config";

export const GET = handle(async () => {
  await requireUser();
  return NextResponse.json({
    config: await getAiConfig(),
    keys: { claude: !!process.env.CLAUDE_API_KEY },
  });
});

export const PUT = handle(async (req: Request) => {
  const user = await requireUser(["super_admin"]);
  const body = await readJson<AiConfig>(req);
  const config = { claudeModel: body.claudeModel };
  if (!isAiConfig(config)) throw new HttpError(400, "Invalid AI configuration.");
  await saveAiConfig(config, user.email);
  await logAudit(user.email, "settings_changed", { aiConfig: config });
  return NextResponse.json({ config });
});
