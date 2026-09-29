import Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "@/lib/ai-models";
import { logAiUsage, type AiTask } from "@/lib/ai-usage";

/** Errors with a message that is safe and useful to show the user. */
export class LlmError extends Error {}

let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.CLAUDE_API_KEY) throw new LlmError("CLAUDE_API_KEY is not configured on the server.");
  anthropicClient ??= new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
  return anthropicClient;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

interface BaseOptions {
  config: AiConfig;
  system: string;
  /** Stable context sent first in the user turn and marked for prompt caching. */
  context: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  /** Who/what the call is for — recorded to the aiUsage collection. */
  usage: { userId: string; email?: string; task: AiTask; jobId?: string };
}

export interface GenerateJsonOptions extends BaseOptions {
  instruction: string;
  /** JSON Schema: every object needs additionalProperties:false and all keys required. */
  schema: Record<string, unknown>;
}

export interface LlmResult<T> {
  output: T;
  model: string;
  usage: LlmUsage;
}

async function claudeCall(opts: BaseOptions, instruction: string, format?: Anthropic.Beta.BetaJSONOutputFormat) {
  const message = await anthropic()
    .beta.messages.stream({
      model: opts.config.claudeModel,
      max_tokens: opts.maxTokens ?? 64000,
      system: opts.system,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: opts.context, cache_control: { type: "ephemeral" } },
            { type: "text", text: instruction },
          ],
        },
      ],
      output_config: { effort: opts.effort ?? "medium", ...(format ? { format } : {}) },
      // On a safety refusal the server retries on an appropriate fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })
    .finalMessage();

  if (message.stop_reason === "refusal") throw new LlmError("Claude declined to process this document.");
  if (message.stop_reason === "max_tokens") throw new LlmError("Claude's response was cut off (output limit reached).");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) throw new LlmError("Empty response from Claude");
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  return {
    text,
    usage: {
      // Claude reports cached input separately; fold it in so inputTokens is the full prompt size.
      inputTokens: message.usage.input_tokens + cacheRead + cacheWrite,
      outputTokens: message.usage.output_tokens,
      cachedInputTokens: cacheRead,
    },
  };
}

async function withUsageLog<T>(opts: BaseOptions, run: () => Promise<LlmResult<T>>): Promise<LlmResult<T>> {
  const started = Date.now();
  try {
    const result = await run();
    await logAiUsage({ ...opts.usage, model: result.model, ...result.usage, durationMs: Date.now() - started, success: true });
    return result;
  } catch (err) {
    // Failed calls may still have been billed; record them with zero tokens so they're visible.
    await logAiUsage({
      ...opts.usage,
      model: opts.config.claudeModel,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      durationMs: Date.now() - started,
      success: false,
    });
    throw err;
  }
}

/** Runs a schema-constrained prompt and records token consumption. */
export async function generateJson<T = unknown>(opts: GenerateJsonOptions): Promise<LlmResult<T>> {
  return withUsageLog(opts, async () => {
    const raw = await claudeCall(opts, opts.instruction, { type: "json_schema", schema: opts.schema });
    let output: T;
    try {
      output = JSON.parse(raw.text) as T;
    } catch {
      throw new LlmError("The model returned malformed JSON. Please try again.");
    }
    return { output, model: opts.config.claudeModel, usage: raw.usage };
  });
}

/** Free-text answer, used by the connection test. */
export async function generateText(opts: BaseOptions & { instruction: string }): Promise<LlmResult<string>> {
  return withUsageLog(opts, async () => {
    const raw = await claudeCall(opts, opts.instruction);
    return { output: raw.text, model: opts.config.claudeModel, usage: raw.usage };
  });
}

/** Turns SDK/network errors into a message that's safe to show in the UI. */
export function llmErrorMessage(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limiting requests. Please wait a minute and try again.";
  if (err instanceof Anthropic.AuthenticationError) return "Claude rejected the API key. Check the server configuration.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach Claude. Please try again.";
  if (err instanceof Anthropic.APIError) return `Claude API error: ${err.message}`;
  return "Something went wrong while calling Claude.";
}
