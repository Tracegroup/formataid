import { NextResponse } from "next/server";
import { handle, toObjectId } from "@/lib/api";
import { HttpError, isAdmin, requireUser } from "@/lib/auth";
import { jobsCollection, toJobView } from "@/lib/jobs";

/** One job including its full change log. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const job = await (await jobsCollection()).findOne({ _id: toObjectId(id, "job") });
  if (!job || (job.userId !== user.id && !isAdmin(user))) throw new HttpError(404, "No such job.");
  return NextResponse.json({ job: toJobView({ ...job, changes: job.changes ?? [] }) });
});
