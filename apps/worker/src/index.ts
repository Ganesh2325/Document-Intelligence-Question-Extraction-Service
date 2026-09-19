import { Worker } from "bullmq";
import IORedis from "ioredis";
import { loadEnv } from "@folio/config";
import { QUEUE_NAMES, type DocumentJobPayload } from "@folio/shared";
import { logger } from "./lib/logger.js";
import { processDocumentJob } from "./pipeline/run.js";
import { closeOcrProvider } from "./providers/ocr/index.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  const env = loadEnv();
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const worker = new Worker<DocumentJobPayload>(
    QUEUE_NAMES.documentProcessing,
    async (job) => {
      logger.info({ jobId: job.id, documentId: job.data.documentId, stage: "queue" }, "job_active");
      await processDocumentJob(job.data, job.attemptsMade + 1);
    },
    {
      connection,
      concurrency: env.WORKER_CONCURRENCY,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, documentId: job.data.documentId }, "job_completed");
  });
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, documentId: job?.data.documentId, err: error }, "job_failed");
  });

  logger.info({ concurrency: env.WORKER_CONCURRENCY, queue: QUEUE_NAMES.documentProcessing }, "folio_worker_started");
  void consumeApiJobs(connection);

  const shutdown = async () => {
    logger.info("folio_worker_stopping");
    await worker.close();
    await closeOcrProvider();
    await prisma.$disconnect();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error({ err: error }, "folio_worker_boot_failed");
  process.exit(1);
});

async function consumeApiJobs(connection: IORedis) {
  for (;;) {
    try {
      const popped = await connection.brpop("folio:document-jobs", 5);
      if (!popped) continue;
      const payload = JSON.parse(popped[1]) as DocumentJobPayload;
      logger.info({ documentId: payload.documentId, source: "fastapi" }, "job_active");
      await processDocumentJob(payload, 1);
    } catch (error) {
      logger.error({ err: error }, "fastapi_job_consume_failed");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
