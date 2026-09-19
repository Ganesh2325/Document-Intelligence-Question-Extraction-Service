import { loadEnv } from "@folio/config";
import { buildApp } from "./app.js";
import { ensureBucket } from "./lib/storage.js";
import { prisma } from "./lib/prisma.js";

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  app.log.info({ port: env.API_PORT }, "folio_api_started");

  try {
    await withTimeout(prisma.$connect(), 8000, "postgres");
    app.log.info("postgres_connected");
  } catch (error) {
    app.log.error({ err: error }, "postgres_connect_failed");
  }

  try {
    await withTimeout(ensureBucket(), 8000, "minio");
    app.log.info("minio_bucket_ready");
  } catch (error) {
    app.log.error({ err: error }, "minio_connect_failed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
