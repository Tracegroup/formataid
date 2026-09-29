"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileText, Loader2 } from "lucide-react";
import ChangeLog from "@/components/ChangeLog";
import { Button } from "@/components/ui/button";
import { MODEL_LABELS } from "@/lib/ai-models";
import { api, errorMessage } from "@/lib/client";
import type { FormatSummary } from "@/lib/formatter/apply";
import type { JobView } from "@/lib/jobs";

const ROWS: { key: keyof FormatSummary; label: string }[] = [
  { key: "headings", label: "Headings fixed" },
  { key: "fakeHeadingsFixed", label: "Hand-formatted headings converted to heading styles" },
  { key: "bodyParagraphs", label: "Body paragraphs restyled" },
  { key: "bullets", label: "Bullet points fixed" },
  { key: "numberedItems", label: "Numbered list items fixed" },
  { key: "tablesRestyled", label: "Tables restyled" },
  { key: "tablesResized", label: "Tables resized to fit the page" },
  { key: "photoTables", label: "Photo grids aligned" },
  { key: "captions", label: "Captions styled" },
  { key: "emptyParagraphsRemoved", label: "Empty paragraphs removed" },
  { key: "directFormattingRemoved", label: "Manual font/size/spacing overrides removed" },
];

export async function downloadJob(id: string, file: "formatted" | "original" = "formatted"): Promise<void> {
  const { url } = await api<{ url: string }>(`/api/jobs/${id}/download${file === "original" ? "?file=original" : ""}`);
  // The link carries Content-Disposition: attachment, so this downloads without leaving the page.
  window.location.href = url;
}

export function DownloadButton({ job, file = "formatted", size = "default" }: { job: JobView; file?: "formatted" | "original"; size?: "default" | "xs" | "sm" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size={size}
        variant={file === "formatted" ? "default" : "outline"}
        className={file === "formatted" ? "bg-[#1B3566] hover:bg-[#1B3566]/90" : undefined}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await downloadJob(job.id, file);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : file === "formatted" ? <Download /> : <FileText />}
        {file === "formatted" ? "Download formatted report" : "Original"}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export default function JobResult({ job }: { job: JobView }) {
  const s = job.summary;
  const rows = s ? ROWS.filter((r) => s[r.key] > 0) : [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{job.formattedFilename}</p>
          <p className="text-xs text-muted-foreground">
            Formatted in {(job.durationMs / 1000).toFixed(0)}s ·{" "}
            {job.classifiedBy === "claude" ? `structure read by ${MODEL_LABELS[job.model ?? ""] ?? job.model ?? "Claude"}` : "rule-based structure detection"} · content
            verified unchanged
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DownloadButton job={job} />
          <DownloadButton job={job} file="original" />
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Changes made{job.changes ? <span className="font-normal text-muted-foreground"> · {job.changes.length}</span> : null}
        </h3>
        {job.changes ? <ChangeLog changes={job.changes} /> : <p className="text-sm text-muted-foreground">Loading changes…</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
        {rows.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between px-3 py-2">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">{s![r.key]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing needed changing.</p>
        )}

        {job.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <p className="mb-1 flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" /> Check before issuing
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {job.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Tracked changes and comments are left exactly as they were. Word will offer to update the table of contents when you open the file — choose
        Yes.
      </p>
    </div>
  );
}
