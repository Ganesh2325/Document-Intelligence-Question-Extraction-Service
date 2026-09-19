import IORedis from "ioredis";
import { Queue } from "bullmq";
import { loadEnv } from "@folio/config";
import { QUEUE_NAMES, type DocumentJobPayload } from "@folio/shared";

let connection: IORedis | null = null;
let documentQueue: Queue<DocumentJobPayload> | null = null;

export function redisConnection(): IORedis {
  if (connection) return connection;
  const env = loadEnv();
  connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connection;
}

export function getDocumentQueue(): Queue<DocumentJobPayload> {
  if (documentQueue) return documentQueue;
  documentQueue = new Queue<DocumentJobPayload>(QUEUE_NAMES.documentProcessing, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 4000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  });
  return documentQueue;
}

export async function enqueueDocumentProcessing(payload: DocumentJobPayload) {
  const queue = getDocumentQueue();
  const jobId = `${payload.documentId}-v${payload.processingVersion}`;
  await queue.add("process", payload, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 4000 },
  });
  return jobId;
}
