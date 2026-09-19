import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "@folio/shared";
import { prisma } from "../lib/prisma.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string };
  }
}

export async function authenticate(request: FastifyRequest): Promise<AuthUser> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    throw new AppError("UNAUTHORIZED", "Authentication is required.", 401);
  }
  return user;
}

export async function registerAuth(app: FastifyInstance) {
  app.decorate("authenticate", authenticate);
}

export async function requireDocument(userId: string, documentId: string) {
  const document = await prisma.document.findFirst({
    where: { id: documentId, ownerId: userId },
  });
  if (!document) {
    throw new AppError("DOCUMENT_NOT_FOUND", "Document was not found.", 404);
  }
  return document;
}

export async function requireQuestion(userId: string, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, document: { ownerId: userId } },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      assets: true,
      answer: { include: { sources: true } },
      reviewItems: true,
      document: { select: { id: true, filename: true, ownerId: true, status: true } },
    },
  });
  if (!question) {
    throw new AppError("QUESTION_NOT_FOUND", "Question was not found.", 404);
  }
  return question;
}
