import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { AppError } from "@folio/shared";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { loginBody, registerBody } from "./schemas.js";

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/auth/register",
    {
      schema: {
        tags: ["Authentication"],
        security: [],
        summary: "Register a new user",
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = registerBody.parse(request.body);
      const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (existing) {
        throw new AppError("EMAIL_IN_USE", "An account with this email already exists.", 409);
      }
      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await prisma.user.create({
        data: {
          name: body.name.trim(),
          email: body.email.toLowerCase(),
          passwordHash,
        },
      });
      const token = await reply.jwtSign({ sub: user.id, email: user.email });
      request.log.info({ userId: user.id }, "user_registered");
      return reply.status(201).send({
        token,
        user: { id: user.id, email: user.email, name: user.name },
      });
    },
  );

  app.post(
    "/api/v1/auth/login",
    {
      schema: {
        tags: ["Authentication"],
        security: [],
        summary: "Login",
      },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const body = loginBody.parse(request.body);
      const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
      if (!user) {
        throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
      }
      const ok = await bcrypt.compare(body.password, user.passwordHash);
      if (!ok) {
        throw new AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
      }
      const token = await reply.jwtSign({ sub: user.id, email: user.email });
      request.log.info({ userId: user.id }, "user_login");
      return { token, user: { id: user.id, email: user.email, name: user.name } };
    },
  );

  app.get(
    "/api/v1/auth/me",
    {
      schema: { tags: ["Authentication"], summary: "Current user" },
    },
    async (request) => {
      const user = await authenticate(request);
      return { user };
    },
  );
}
