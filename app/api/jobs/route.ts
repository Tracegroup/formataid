import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { HttpError, isAdmin, requireUser } from "@/lib/auth";
import { ContentChangedError, FormatInputError, formatReport } from "@/lib/formatter";
import { claudeClassifier } from "@/lib/formatter/classify";
import { jobsCollection, toJobView, type JobDoc } from "@/lib/jobs";
import { DOCX_TYPE, KEY_PREFIX, MAX_UPLOAD_BYTES, getObjectBuffer, getObjectSize, putObject } from "@/lib/s3";

// Claude classification of a long report plus S3 transfers can take a minute or two.
export const maxDuration = 300;

/** Formats a report already uploaded to S3 and records the job. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { key, filename } = await readJson<{ key?: string; filename?: string }>(req);
  const ownPrefix = `${KEY_PREFIX}/${user.id}/`;
  if (!key || !key.startsWith(ownPrefix) || !key.endsWith("/original.docx") || key.includes("..")) throw new HttpError(400, "Invalid upload.");
  const name = (filename ?? "report.docx").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);

  const size = await getObjectSize(key).catch(() => 0);
  if (!size) throw new HttpError(400, "The upload could not be found. Please upload the file again.");
  if (size > MAX_UPLOAD_BYTES) throw new HttpError(400, "The file is too large.");

  const _id = new ObjectId();
  const started = Date.now();
  const base: Omit<JobDoc, "status" | "error" | "summary" | "changes" | "warnings" | "classifiedBy" | "model" | "durationMs" | "outputKey"> = {
    _id,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    filename: name,
    inputKey: key,
    createdAt: new Date(),
  };
  const jobs = await jobsCollection();

  try {
    const result = await formatReport(await getObjectBuffer(key), {
      classify: claudeClassifier({ userId: user.id, email: user.email, jobId: _id.toHexString() }),
    });
    const outputKey = key.replace(/original\.docx$/, "formatted.docx");
    await putObject(outputKey, result.buffer, DOCX_TYPE);
    const job: JobDoc = {
      ...base,
      outputKey,
      status: "done",
      error: null,
      summary: result.summary,
      changes: result.changes,
      warnings: result.warnings,
      classifiedBy: result.classifiedBy,
      model: result.model ?? null,
      durationMs: Date.now() - started,
    };
    await jobs.insertOne(job);
    await logAudit(user.email, "report_formatted", { jobId: _id.toHexString(), filename: name, classifiedBy: result.classifiedBy });
    return NextResponse.json({ job: toJobView(job) });
  } catch (err) {
    console.error("Formatting failed:", err);
    const message =
      err instanceof ContentChangedError
        ? "Formatting was stopped because it would have changed the report's content. Nothing was saved — please report this file to the administrator."
        : err instanceof FormatInputError
          ? err.message
          : "Something went wrong while formatting this report.";
    await jobs.insertOne({
      ...base,
      outputKey: null,
      status: "failed",
      error: message,
      summary: null,
      changes: [],
      warnings: [],
      classifiedBy: null,
      model: null,
      durationMs: Date.now() - started,
    });
    throw new HttpError(422, message);
  }
});

/** Formatting history: your own jobs, or everyone's for admins (?all=1). */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const all = new URL(req.url).searchParams.get("all") === "1" && isAdmin(user);
  const jobs = await jobsCollection();
  const rows = await jobs
    .find(all ? {} : { userId: user.id }, { projection: { changes: 0 } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return NextResponse.json({ jobs: rows.map(toJobView), all });
});
