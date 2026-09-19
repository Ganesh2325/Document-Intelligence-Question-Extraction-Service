import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { redisConnection } from "../lib/queue.js";
import { storageClient } from "../lib/storage.js";
import { loadEnv } from "@folio/config";

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: { tags: ["Health"], security: [], summary: "Liveness probe" },
    },
    async () => ({ status: "ok", service: "folio-api", time: new Date().toISOString() }),
  );

  app.get(
    "/health/ready",
    {
      schema: { tags: ["Health"], security: [], summary: "Readiness probe" },
    },
    async (_request, reply) => {
      const checks: Record<string, "ok" | "error"> = { database: "ok", redis: "ok", storage: "ok" };
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        checks.database = "error";
      }
      try {
        const pong = await redisConnection().ping();
        if (pong !== "PONG") checks.redis = "error";
      } catch {
        checks.redis = "error";
      }
      try {
        const env = loadEnv();
        await storageClient().bucketExists(env.MINIO_BUCKET);
      } catch {
        checks.storage = "error";
      }
      const ready = Object.values(checks).every((v) => v === "ok");
      return reply.status(ready ? 200 : 503).send({ status: ready ? "ready" : "not_ready", checks });
    },
  );
}
