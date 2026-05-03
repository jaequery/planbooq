import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/env";

let cached: S3Client | null = null;

export function getS3Client(): S3Client {
  if (cached) return cached;
  cached = new S3Client({
    region: env.AWS_S3_REGION,
    endpoint: env.AWS_S3_ENDPOINT,
    forcePathStyle: false,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return cached;
}

export function attachmentObjectKey(workspaceId: string, attachmentId: string): string {
  return `attachments/${workspaceId}/${attachmentId}`;
}

export async function putAttachmentObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
  contentLength: number;
}): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      ACL: "private",
    }),
  );
}

export async function getAttachmentObject(key: string): Promise<GetObjectCommandOutput | null> {
  try {
    return await getS3Client().send(new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }));
  } catch (error) {
    const code =
      (error as { name?: string; Code?: string })?.name ?? (error as { Code?: string })?.Code;
    if (code === "NoSuchKey" || code === "NotFound") return null;
    throw error;
  }
}
