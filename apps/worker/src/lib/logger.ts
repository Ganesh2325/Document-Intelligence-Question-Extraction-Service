import pino from "pino";

export const logger = pino({
  name: "folio-worker",
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["AI_API_KEY", "MINIO_SECRET_KEY", "JWT_SECRET"],
});
