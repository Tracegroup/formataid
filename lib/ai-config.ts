import { getDb } from "@/lib/mongodb";
import { DEFAULT_AI_CONFIG, isAiConfig, type AiConfig } from "@/lib/ai-models";

export * from "@/lib/ai-models";

const CACHE_MS = 30_000;
let cached: { config: AiConfig; at: number } | null = null;

/** Admin-selected default AI provider/model. Cached briefly per server instance. */
export async function getAiConfig(): Promise<AiConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config;
  try {
    const db = await getDb();
    const doc = await db.collection("settings").findOne({ key: "aiConfig" });
    const config = { ...DEFAULT_AI_CONFIG, ...(doc?.value ?? {}) };
    cached = { config: isAiConfig(config) ? config : DEFAULT_AI_CONFIG, at: Date.now() };
  } catch (err) {
    console.error("getAiConfig failed, using defaults:", err);
    return DEFAULT_AI_CONFIG;
  }
  return cached.config;
}

export async function saveAiConfig(config: AiConfig, updatedBy: string): Promise<void> {
  const db = await getDb();
  await db.collection("settings").updateOne(
    { key: "aiConfig" },
    { $set: { key: "aiConfig", value: config, updatedAt: new Date(), updatedBy } },
    { upsert: true }
  );
  cached = { config, at: Date.now() };
}
