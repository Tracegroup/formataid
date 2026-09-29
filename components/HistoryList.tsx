"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import JobResult, { DownloadButton } from "@/components/JobResult";
import StatusBadge from "@/components/StatusBadge";
import { api, errorMessage } from "@/lib/client";
import type { JobView } from "@/lib/jobs";

export default function HistoryList({ canSeeAll }: { canSeeAll: boolean }) {
  const [all, setAll] = useState(false);
  const [jobs, setJobs] = useState<JobView[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // Full jobs (with their change logs), loaded when a row is first expanded.
  const [details, setDetails] = useState<Record<string, JobView>>({});

  function toggle(job: JobView) {
    const next = open === job.id ? null : job.id;
    setOpen(next);
    if (next && job.status === "done" && !details[job.id]) {
      api<{ job: JobView }>(`/api/jobs/${job.id}`)
        .then((r) => setDetails((d) => ({ ...d, [job.id]: r.job })))
        .catch((err) => setError(errorMessage(err)));
    }
  }

  useEffect(() => {
    api<{ jobs: JobView[] }>(`/api/jobs${all ? "?all=1" : ""}`)
      .then((r) => setJobs(r.jobs))
      .catch((err) => setError(errorMessage(err)));
  }, [all]);

  return (
    <div className="max-w-5xl space-y-3">
      {canSeeAll && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => {
              setJobs(null);
              setAll(e.target.checked);
            }}
          />
          Show everyone&apos;s reports
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!jobs ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl border bg-white p-5 text-sm text-muted-foreground">No reports formatted yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs font-semibold text-slate-600">
              <tr className="border-b">
                <th className="w-8" />
                <th className="py-2 pr-3">Report</th>
                {all && <th className="py-2 pr-3">By</th>}
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr className="cursor-pointer hover:bg-slate-50" onClick={() => toggle(job)}>
                    <td className="pl-3 text-slate-400">{open === job.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className="max-w-[320px] truncate py-2.5 pr-3 font-medium text-slate-900">{job.filename}</td>
                    {all && <td className="py-2.5 pr-3 text-slate-600">{job.user.name}</td>}
                    <td className="whitespace-nowrap py-2.5 pr-3 text-slate-600">{new Date(job.createdAt).toLocaleString()}</td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-2 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {job.status === "done" && <DownloadButton job={job} size="xs" />}
                    </td>
                  </tr>
                  {open === job.id && (
                    <tr>
                      <td />
                      <td colSpan={all ? 5 : 4} className="py-4 pr-4">
                        {job.status === "done" ? <JobResult job={details[job.id] ?? job} /> : <p className="text-sm text-red-700">{job.error}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
