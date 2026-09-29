import "server-only";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Files go straight between the browser and S3 via presigned URLs, because Vercel
// functions cannot receive or return bodies larger than 4.5 MB.

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
export const KEY_PREFIX = "formatassist";

let client: S3Client | null = null;
function s3(): S3Client {
  client ??= new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    },
  });
  return client;
}

function bucket(): string {
  const name = process.env.S3_BUCKET_NAME;
  if (!name) throw new Error("S3_BUCKET_NAME is not configured.");
  return name;
}

export function createUploadUrl(key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: 300 });
}

/** Presigned GET that makes the browser save the file under `filename`. */
export function createDownloadUrl(key: string, filename: string): Promise<string> {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      ResponseContentType: DOCX_TYPE,
    }),
    { expiresIn: 300 }
  );
}

export async function getObjectSize(key: string): Promise<number> {
  const result = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return result.ContentLength ?? 0;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const bytes = await result.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty object body for key: ${key}`);
  return Buffer.from(bytes);
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}
