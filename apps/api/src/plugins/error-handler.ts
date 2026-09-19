import { AppError } from "@folio/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function sendError(
  reply: FastifyReply,
  request: FastifyRequest,
  code: string,
  message: string,
  statusCode: number,
  details?: unknown,
) {
  return reply.status(statusCode).send({
    error: {
      code,
      message,
      requestId: request.id,
      ...(details && process.env.NODE_ENV !== "production" ? { details } : {}),
    },
  });
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(reply, request, error.code, error.message, error.statusCode, error.details);
    }

    const err = error as { statusCode?: number; code?: string; message: string; validation?: unknown };
    if (err.validation) {
      return sendError(reply, request, "VALIDATION_ERROR", "Request validation failed.", 400, err.validation);
    }
    if (err.statusCode === 429) {
      return sendError(reply, request, "RATE_LIMITED", "Too many requests. Please wait and try again.", 429);
    }
    if (err.statusCode === 401 || err.code === "FST_JWT_NO_AUTHORIZATION_IN_HEADER" || err.code === "FST_JWT_AUTHORIZATION_TOKEN_INVALID") {
      return sendError(reply, request, "UNAUTHORIZED", "Authentication is required.", 401);
    }

    request.log.error({ err: error }, "unhandled_error");
    const message =
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : err.message;
    return sendError(reply, request, "INTERNAL_ERROR", message, err.statusCode ?? 500);
  });

  app.setNotFoundHandler((request, reply) => {
    return sendError(reply, request, "NOT_FOUND", "The requested resource was not found.", 404);
  });
}
