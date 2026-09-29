import "server-only";
import type { ObjectId } from "mongodb";
import type { ChangeEntry, FormatSummary } from "@/lib/formatter/apply";
import { getDb } from "@/lib/mongodb";

export interface JobDoc {
  _id: ObjectId;
  userId: string;
  userEmail: string;
  userName: string;
  filename: string;
  inputKey: string;
  outputKey: string | null;
  status: "done" | "failed";
  error: string | null;
  summary: FormatSummary | null;
  changes: ChangeEntry[];
  warnings: string[];
  classifiedBy: "claude" | "heuristic" | null;
  model: string | null;
  durationMs: number;
  createdAt: Date;
}

/** Shape sent to the browser — never includes S3 keys. */
export interface JobView {
  id: string;
  filename: string;
  formattedFilename: string;
  status: JobDoc["status"];
  error: string | null;
  summary: FormatSummary | null;
  /** Omitted from history listings; load the job by id to get it. */
  changes?: ChangeEntry[];
  warnings: string[];
  classifiedBy: JobDoc["classifiedBy"];
  model: string | null;
  durationMs: number;
  createdAt: string;
  user: { email: string; name: string };
}

let indexed = false;
export async function jobsCollection() {
  const col = (await getDb()).collection<JobDoc>("jobs");
  if (!indexed) {
    indexed = true;
    col.createIndex({ userId: 1, createdAt: -1 }).catch(() => {});
    col.createIndex({ createdAt: -1 }).catch(() => {});
  }
  return col;
}

export function formattedFilename(filename: string): string {
  return `${filename.replace(/\.docx$/i, "")} - Formatted.docx`;
}

export function toJobView(job: JobDoc | Omit<JobDoc, "changes">): JobView {
  return {
    id: job._id.toHexString(),
    filename: job.filename,
    formattedFilename: formattedFilename(job.filename),
    status: job.status,
    error: job.error,
    summary: job.summary,
    ...("changes" in job ? { changes: job.changes ?? [] } : {}),
    warnings: job.warnings,
    classifiedBy: job.classifiedBy,
    model: job.model,
    durationMs: job.durationMs,
    createdAt: job.createdAt.toISOString(),
    user: { email: job.userEmail, name: job.userName },
  };
}
