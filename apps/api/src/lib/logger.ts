import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function getRequestId(req: IncomingMessage): string {
  const existing = req.headers["x-request-id"];
  if (typeof existing === "string" && existing.trim()) return existing;
  return randomUUID();
}

export const loggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "password",
      "passwordHash",
      "JWT_SECRET",
      "AI_API_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_ACCESS_KEY",
    ],
    remove: true,
  },
};
