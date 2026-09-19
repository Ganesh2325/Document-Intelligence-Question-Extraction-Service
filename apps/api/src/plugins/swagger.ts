import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { loadEnv } from "@folio/config";

export async function registerSwagger(app: FastifyInstance) {
  const env = loadEnv();
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Folio Document Intelligence API",
        description:
          "API for ingesting examination documents, extracting questions, matching answer keys, and managing human review.",
        version: "1.0.0",
      },
      servers: [{ url: env.PUBLIC_API_URL, description: "Current environment" }],
      tags: [
        { name: "Health", description: "Liveness and readiness" },
        { name: "Authentication", description: "Register, login, current user" },
        { name: "Documents", description: "Upload and manage documents" },
        { name: "Processing", description: "Asynchronous processing control" },
        { name: "Questions", description: "Extracted questions" },
        { name: "Answers", description: "Answer-key associations" },
        { name: "Review", description: "Human review queue" },
        { name: "Document Groups", description: "Related document sets" },
        { name: "Dashboard", description: "Workspace metrics" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
}
