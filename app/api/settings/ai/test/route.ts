import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { isAiConfig } from "@/lib/ai-models";
import { generateText, llmErrorMessage } from "@/lib/llm";

export const maxDuration = 60;

/** Sends a tiny prompt to the chosen model to confirm the key and model work. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(["super_admin"]);
  const { model } = await readJson<{ model?: string }>(req);
  const config = { claudeModel: model };
  if (!isAiConfig(config)) throw new HttpError(400, "Unknown model.");
  const started = Date.now();
  try {
    const result = await generateText({
      config,
      system: "You are a connectivity check. Reply with exactly: OK",
      context: "Connection test.",
      instruction: "Reply with OK.",
      effort: "low",
      maxTokens: 2000,
      usage: { userId: user.id, email: user.email, task: "connection_test" },
    });
    return NextResponse.json({ ok: true, model: result.model, reply: result.output.slice(0, 100), ms: Date.now() - started });
  } catch (err) {
    return NextResponse.json({ ok: false, error: llmErrorMessage(err) });
  }
});
