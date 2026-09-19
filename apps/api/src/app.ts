import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "@folio/config";
import { getRequestId, loggerOptions } from "./lib/logger.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerSwagger } from "./plugins/swagger.js";
import { authRoutes } from "./modules/auth-routes.js";
import { healthRoutes } from "./modules/health-routes.js";
import { documentRoutes } from "./modules/document-routes.js";
import { questionRoutes } from "./modules/question-routes.js";
import { reviewRoutes } from "./modules/review-routes.js";
import { groupRoutes } from "./modules/group-routes.js";
import { dashboardRoutes } from "./modules/dashboard-routes.js";

export async function buildApp() {
  const env = loadEnv();
  const app = Fastify({
    logger: loggerOptions,
    genReqId: getRequestId,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
    bodyLimit: env.MAX_FILE_SIZE + 1024 * 1024,
  }) as FastifyInstance;

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
    allowList: ["127.0.0.1"],
  });
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });
  await app.register(multipart, {
    limits: { fileSize: env.MAX_FILE_SIZE, files: 5 },
  });
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    try {
      const text = String(body ?? "").trim();
      done(null, text ? JSON.parse(text) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  await registerSwagger(app);
  registerErrorHandler(app);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(documentRoutes);
  await app.register(questionRoutes);
  await app.register(reviewRoutes);
  await app.register(groupRoutes);
  await app.register(dashboardRoutes);

  return app;
}
