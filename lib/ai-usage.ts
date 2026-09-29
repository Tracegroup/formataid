import { getDb } from "@/lib/mongodb";

export type AiTask = "classify_report" | "connection_test";

export interface AiUsageEntry {
  userId: string;
  email?: string;
  task: AiTask;
  jobId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Portion of inputTokens served from the provider's prompt cache (0 if none). */
  cachedInputTokens: number;
  durationMs: number;
  success: boolean;
}

// USD per million tokens [input, output].
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}

let indexEnsured = false;

/** Best-effort usage record — never throws, so a logging failure can't break the AI call it describes. */
export async function logAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const db = await getDb();
    const collection = db.collection("aiUsage");
    if (!indexEnsured) {
      indexEnsured = true;
      collection.createIndex({ createdAt: -1 }).catch(() => {});
    }
    await collection.insertOne({
      ...entry,
      costUsd: estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens),
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("logAiUsage failed:", err);
  }
}

export interface AiUsageSummaryRow {
  model: string;
  task: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export async function getAiUsageSummary(days: number): Promise<AiUsageSummaryRow[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .collection("aiUsage")
    .aggregate<{ _id: { model: string; task: string }; calls: number; failures: number; inputTokens: number; outputTokens: number }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { model: "$model", task: "$task" },
          calls: { $sum: 1 },
          failures: { $sum: { $cond: ["$success", 0, 1] } },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
        },
      },
      { $sort: { "_id.model": 1, "_id.task": 1 } },
    ])
    .toArray();
  return rows.map((r) => ({
    ...r._id,
    calls: r.calls,
    failures: r.failures,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: estimateCostUsd(r._id.model, r.inputTokens, r.outputTokens),
  }));
}
