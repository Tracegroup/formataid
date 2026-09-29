// Client-safe AI model constants (no server imports) — shared by
// lib/ai-config.ts, the Settings page and the formatter.

export type ClaudeModel = "claude-opus-5-5" | "claude-sonnet-5-5";

export interface AiConfig {
  claudeModel: ClaudeModel;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  claudeModel: "claude-opus-5-5",
};

export const CLAUDE_MODELS: ClaudeModel[] = ["claude-opus-5-5", "claude-sonnet-5-5"];

export const MODEL_LABELS: Record<string, string> = {
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
};

export const MODEL_CHOICES: { value: ClaudeModel; label: string }[] = CLAUDE_MODELS.map((m) => ({ value: m, label: MODEL_LABELS[m] }));

export function isAiConfig(value: unknown): value is AiConfig {
  const v = value as Partial<AiConfig> | null;
  return !!v && CLAUDE_MODELS.includes(v.claudeModel as ClaudeModel);
}
