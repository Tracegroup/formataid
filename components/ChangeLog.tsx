"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ChangeEntry, ChangeKind } from "@/lib/formatter/apply";

const KIND_LABELS: Record<ChangeKind, string> = {
  heading: "Heading",
  body: "Text",
  bullet: "Bullet",
  numbered: "Numbered",
  caption: "Caption",
  table: "Table",
  photo: "Photos",
  empty: "Empty line",
};

const KIND_STYLES: Record<ChangeKind, string> = {
  heading: "bg-[#1B3566]/10 text-[#1B3566]",
  body: "bg-slate-100 text-slate-700",
  bullet: "bg-sky-50 text-sky-800",
  numbered: "bg-sky-50 text-sky-800",
  caption: "bg-violet-50 text-violet-800",
  table: "bg-emerald-50 text-emerald-800",
  photo: "bg-emerald-50 text-emerald-800",
  empty: "bg-amber-50 text-amber-800",
};

const FILTERS: { label: string; kinds: ChangeKind[] | null }[] = [
  { label: "All", kinds: null },
  { label: "Headings", kinds: ["heading"] },
  { label: "Text", kinds: ["body", "caption"] },
  { label: "Lists", kinds: ["bullet", "numbered"] },
  { label: "Tables", kinds: ["table", "photo"] },
  { label: "Empty lines", kinds: ["empty"] },
];

export default function ChangeLog({ changes }: { changes: ChangeEntry[] }) {
  const [filter, setFilter] = useState(0);

  const groups = useMemo(() => {
    const kinds = FILTERS[filter].kinds;
    const out: { section: string; items: ChangeEntry[] }[] = [];
    for (const c of changes) {
      if (kinds && !kinds.includes(c.kind)) continue;
      const section = c.section || "Start of report";
      const last = out[out.length - 1];
      if (last && last.section === section) last.items.push(c);
      else out.push({ section, items: [c] });
    }
    return out;
  }, [changes, filter]);

  if (!changes.length) return <p className="text-sm text-muted-foreground">No changes were needed — the report already follows the TCG standards.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f, i) => {
          const count = f.kinds ? changes.filter((c) => f.kinds!.includes(c.kind)).length : changes.length;
          if (!count) return null;
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(i)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                filter === i ? "border-[#1B3566] bg-[#1B3566] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="max-h-[60vh] overflow-y-auto rounded-lg border bg-white">
        {groups.map((g, gi) => (
          <section key={`${g.section}-${gi}`}>
            <h3 className="sticky top-0 z-10 border-b bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {g.section} <span className="font-normal text-slate-400">· {g.items.length}</span>
            </h3>
            <ul className="divide-y">
              {g.items.map((c, i) => (
                <li key={i} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLES[c.kind]}`}>{KIND_LABELS[c.kind]}</span>
                    <span className="min-w-0 flex-1 text-slate-900">{c.kind === "empty" ? <span className="text-slate-500">{c.from === "1 empty line" ? "Empty line" : c.from} removed {c.text}</span> : c.text ? `“${c.text}”` : <em className="text-slate-400">(no text)</em>}</span>
                  </div>
                  {c.kind !== "empty" && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.from}</span>
                      <ArrowRight className="size-3 text-slate-400" />
                      <span className="rounded bg-[#1B3566]/10 px-1.5 py-0.5 font-medium text-[#1B3566]">{c.to}</span>
                    </div>
                  )}
                  {c.details.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {c.details.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
