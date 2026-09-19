import { Client } from "minio";
import { loadEnv } from "@folio/config";

let client: Client | null = null;

export function storageClient(): Client {
  if (client) return client;
  const env = loadEnv();
  client = new Client({
    endPoint: env.MINIO_ENDPOINT,
    port: env.MINIO_PORT,
    useSSL: Boolean(env.MINIO_USE_SSL),
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
    region: env.MINIO_REGION,
  });
  return client;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const env = loadEnv();
  const stream = await storageClient().getObject(env.MINIO_BUCKET, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function putObject(key: string, body: Buffer, mimeType: string) {
  const env = loadEnv();
  await storageClient().putObject(env.MINIO_BUCKET, key, body, body.length, {
    "Content-Type": mimeType,
  });
}

export async function deleteObject(key: string) {
  const env = loadEnv();
  await storageClient().removeObject(env.MINIO_BUCKET, key);
}
