import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth";
import { DOCX_TYPE, KEY_PREFIX, MAX_UPLOAD_BYTES, createUploadUrl } from "@/lib/s3";

/** Returns a presigned S3 PUT URL for one .docx upload. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { filename, size } = await readJson<{ filename?: string; size?: number }>(req);
  if (!filename || !/\.docx$/i.test(filename)) throw new HttpError(400, "Please upload a Word document (.docx).");
  if (typeof size !== "number" || size <= 0) throw new HttpError(400, "The file is empty.");
  if (size > MAX_UPLOAD_BYTES) throw new HttpError(400, `The file is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);

  const key = `${KEY_PREFIX}/${user.id}/${randomUUID()}/original.docx`;
  return NextResponse.json({ key, uploadUrl: await createUploadUrl(key, DOCX_TYPE), contentType: DOCX_TYPE });
});
