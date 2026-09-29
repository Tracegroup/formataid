import { NextResponse } from "next/server";
import { handle, toObjectId } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { HttpError, isAdmin, requireUser } from "@/lib/auth";
import { formattedFilename, jobsCollection } from "@/lib/jobs";
import { createDownloadUrl } from "@/lib/s3";

/** Returns a short-lived download link for a job's formatted (default) or original file. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const job = await (await jobsCollection()).findOne({ _id: toObjectId(id, "job") });
  if (!job || (job.userId !== user.id && !isAdmin(user))) throw new HttpError(404, "No such job.");

  const original = new URL(req.url).searchParams.get("file") === "original";
  const key = original ? job.inputKey : job.outputKey;
  if (!key) throw new HttpError(404, "This job has no formatted file.");
  const url = await createDownloadUrl(key, original ? job.filename : formattedFilename(job.filename));
  await logAudit(user.email, "report_downloaded", { jobId: id, file: original ? "original" : "formatted" });
  return NextResponse.json({ url });
});
