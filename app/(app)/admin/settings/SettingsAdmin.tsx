"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/client";
import { MODEL_CHOICES, MODEL_LABELS, isAiConfig, type AiConfig } from "@/lib/ai-models";

interface UsageRow {
  model: string;
  task: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

const TASK_LABELS: Record<string, string> = {
  classify_report: "Format report",
  connection_test: "Connection test",
};

export default function SettingsAdmin({ canEditModel }: { canEditModel: boolean }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [keys, setKeys] = useState<{ claude: boolean } | null>(null);
  const [model, setModel] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [tests, setTests] = useState<Record<string, { state: "running" | "ok" | "fail"; text: string }>>({});
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<UsageRow[] | null>(null);

  useEffect(() => {
    api<{ config: AiConfig; keys: { claude: boolean } }>("/api/settings/ai")
      .then((r) => {
        setConfig(r.config);
        setKeys(r.keys);
        setModel(r.config.claudeModel);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const loadUsage = useCallback(() => {
    api<{ rows: UsageRow[] }>(`/api/settings/usage?days=${days}`)
      .then((r) => setUsage(r.rows))
      .catch((err) => setError(errorMessage(err)));
  }, [days]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  async function save() {
    const next = { claudeModel: model };
    if (!isAiConfig(next)) return;
    try {
      const r = await api<{ config: AiConfig }>("/api/settings/ai", { method: "PUT", json: next });
      setConfig(r.config);
      setNotice(`Default model set to ${MODEL_LABELS[r.config.claudeModel]}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function test(value: string) {
    setTests((t) => ({ ...t, [value]: { state: "running", text: "" } }));
    try {
      const r = await api<{ ok: boolean; error?: string; ms?: number }>("/api/settings/ai/test", { method: "POST", json: { model: value } });
      setTests((t) => ({ ...t, [value]: r.ok ? { state: "ok", text: `Working (${((r.ms ?? 0) / 1000).toFixed(1)}s)` } : { state: "fail", text: r.error ?? "Failed" } }));
    } catch (err) {
      setTests((t) => ({ ...t, [value]: { state: "fail", text: errorMessage(err) } }));
    } finally {
      loadUsage();
    }
  }

  const totals = usage?.reduce(
    (acc, r) => ({ calls: acc.calls + r.calls, input: acc.input + r.inputTokens, output: acc.output + r.outputTokens, cost: acc.cost + (r.costUsd ?? 0) }),
    { calls: 0, input: 0, output: 0, cost: 0 }
  );

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="AI & Usage" description="Choose the Claude model used to classify report paragraphs and see token usage." />
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-xl border bg-white p-5">
        <h2 className="mb-3 font-semibold">Default model</h2>
        {config && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Model used for formatting</span>
              <Select value={model} onChange={(e) => setModel(e.target.value)} disabled={!canEditModel} className="w-64">
                {MODEL_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </label>
            {canEditModel && (
              <Button className="bg-[#1B3566] hover:bg-[#1B3566]/90" onClick={save} disabled={model === config.claudeModel}>
                Save
              </Button>
            )}
            {!canEditModel && <p className="text-xs text-muted-foreground">Only a super admin can change this.</p>}
          </div>
        )}
        {notice && <p className="mt-2 text-sm text-emerald-700">{notice}</p>}

        <h3 className="mt-6 mb-2 text-sm font-semibold">Providers</h3>
        <ul className="divide-y rounded-lg border">
          {MODEL_CHOICES.map((c) => {
            const hasKey = keys ? keys.claude : true;
            const t = tests[c.value];
            return (
              <li key={c.value} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-40 font-medium">{c.label}</span>
                <span className={`text-xs ${hasKey ? "text-emerald-700" : "text-red-600"}`}>
                  {hasKey ? "API key configured" : "CLAUDE_API_KEY missing"}
                </span>
                {t && (
                  <span className={`flex items-center gap-1 text-xs ${t.state === "fail" ? "text-red-600" : t.state === "ok" ? "text-emerald-700" : "text-muted-foreground"}`}>
                    {t.state === "running" ? <Loader2 className="size-3 animate-spin" /> : t.state === "ok" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                    {t.text}
                  </span>
                )}
                {canEditModel && (
                  <Button size="xs" variant="outline" className="ml-auto" onClick={() => test(c.value)} disabled={t?.state === "running" || !hasKey}>
                    Test connection
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Usage</h2>
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-40">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </Select>
        </div>
        {!usage ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI calls in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs font-semibold text-slate-600">
                <tr className="border-b">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Task</th>
                  <th className="py-2 pr-3 text-right">Calls</th>
                  <th className="py-2 pr-3 text-right">Input tokens</th>
                  <th className="py-2 pr-3 text-right">Output tokens</th>
                  <th className="py-2 text-right">Est. cost (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {usage.map((r) => (
                  <tr key={`${r.model}-${r.task}`}>
                    <td className="py-2 pr-3">{MODEL_LABELS[r.model] ?? r.model}</td>
                    <td className="py-2 pr-3">
                      {TASK_LABELS[r.task] ?? r.task}
                      {r.failures > 0 && <span className="ml-1 text-xs text-red-600">({r.failures} failed)</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{r.calls}</td>
                    <td className="py-2 pr-3 text-right">{r.inputTokens.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">{r.outputTokens.toLocaleString()}</td>
                    <td className="py-2 text-right">{r.costUsd === null ? "—" : `$${r.costUsd.toFixed(2)}`}</td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="border-t font-medium">
                  <tr>
                    <td className="py-2 pr-3" colSpan={2}>
                      Total
                    </td>
                    <td className="py-2 pr-3 text-right">{totals.calls}</td>
                    <td className="py-2 pr-3 text-right">{totals.input.toLocaleString()}</td>
                    <td className="py-2 pr-3 text-right">{totals.output.toLocaleString()}</td>
                    <td className="py-2 text-right">${totals.cost.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Costs are estimates based on list prices.</p>
          </div>
        )}
      </section>
    </div>
  );
}
