"use client";

import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, RotateCcw, XCircle } from "lucide-react";
import JobResult from "@/components/JobResult";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client";
import type { JobView } from "@/lib/jobs";

const MAX_MB = 30;

type Phase =
  | { name: "idle" }
  | { name: "uploading"; file: File; progress: number }
  | { name: "formatting"; file: File; startedAt: number }
  | { name: "done"; job: JobView }
  | { name: "error"; message: string };

function putWithProgress(url: string, file: File, contentType: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(file);
  });
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.round((now - since) / 1000))}s</span>;
}

export default function FormatReport() {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(file: File) {
    if (!/\.docx$/i.test(file.name)) {
      setPhase({ name: "error", message: "Please choose a Word document (.docx). Older .doc files must be re-saved as .docx first." });
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setPhase({ name: "error", message: `The file is larger than ${MAX_MB} MB.` });
      return;
    }
    try {
      setPhase({ name: "uploading", file, progress: 0 });
      const { key, uploadUrl, contentType } = await api<{ key: string; uploadUrl: string; contentType: string }>("/api/uploads", {
        method: "POST",
        json: { filename: file.name, size: file.size },
      });
      await putWithProgress(uploadUrl, file, contentType, (progress) => setPhase({ name: "uploading", file, progress }));
      setPhase({ name: "formatting", file, startedAt: Date.now() });
      const { job } = await api<{ job: JobView }>("/api/jobs", { method: "POST", json: { key, filename: file.name } });
      setPhase({ name: "done", job });
    } catch (err) {
      setPhase({ name: "error", message: errorMessage(err) });
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void start(file);
  }

  const busy = phase.name === "uploading" || phase.name === "formatting";

  return (
    <div className="max-w-3xl space-y-5">
      {(phase.name === "idle" || phase.name === "error") && (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-[#1B3566] bg-blue-50" : "border-slate-300 bg-white hover:border-[#1B3566]/60 hover:bg-slate-50"
          }`}
        >
          <FileUp className="size-8 text-[#1B3566]" />
          <span className="text-sm font-medium text-slate-900">Drop a report here, or click to choose a file</span>
          <span className="text-xs text-muted-foreground">Word document (.docx) started from the TCG report template · up to {MAX_MB} MB</span>
        </button>
      )}
      <input ref={input} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {phase.name === "error" && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <XCircle className="mt-0.5 size-4 shrink-0" /> {phase.message}
        </p>
      )}

      {busy && (
        <div className="rounded-xl border bg-white p-5">
          <p className="truncate text-sm font-medium text-slate-900">{phase.file.name}</p>
          {phase.name === "uploading" ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">Uploading… {Math.round(phase.progress * 100)}%</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#1B3566] transition-all" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <Loader2 className="size-4 animate-spin text-[#1B3566]" />
              Reading the report structure and applying TCG styles… <Elapsed since={phase.startedAt} />
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">This usually takes under a minute. Keep this tab open.</p>
        </div>
      )}

      {phase.name === "done" && (
        <div className="rounded-xl border bg-white p-5">
          <JobResult job={phase.job} />
          <div className="mt-5 border-t pt-4">
            <Button variant="outline" onClick={() => setPhase({ name: "idle" })}>
              <RotateCcw /> Format another report
            </Button>
          </div>
        </div>
      )}

      {phase.name === "idle" && (
        <section className="rounded-xl border bg-white p-5 text-sm text-slate-700">
          <h2 className="mb-2 font-semibold text-slate-900">What gets fixed</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Headings, body text and bullets are set to the TCG styles (fonts, sizes, indents, spacing and numbering).</li>
            <li>Tables get the TCG header and row shading, are aligned to their section and resized to fit the page.</li>
            <li>Manual font, size and colour overrides and stray empty lines are removed.</li>
          </ul>
          <h2 className="mb-2 mt-4 font-semibold text-slate-900">What is never changed</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>The wording — every run is checked, and the file is rejected if any text would change.</li>
            <li>The cover page, table of contents, signature block, appendices, tracked changes and comments.</li>
          </ul>
        </section>
      )}
    </div>
  );
}
