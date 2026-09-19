import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { AppError } from "@folio/shared";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../lib/pagination.js";
import { authenticate, requireQuestion } from "../plugins/auth.js";
import { questionListQuery, updateQuestionBody } from "./schemas.js";
import { serializeQuestion } from "./serializers.js";

export async function questionRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/questions",
    { schema: { tags: ["Questions"], summary: "Search questions across documents" } },
    async (request) => {
      const user = await authenticate(request);
      const query = questionListQuery.parse(request.query);
      const { page, limit, skip } = parsePagination(query, 30);
      const where: Prisma.QuestionWhereInput = {
        document: { ownerId: user.id },
        ...(query.documentId ? { documentId: query.documentId } : {}),
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.type ? { questionType: query.type as never } : {}),
        ...(query.q
          ? {
              OR: [
                { questionText: { contains: query.q, mode: "insensitive" as const } },
                { questionNumber: { contains: query.q, mode: "insensitive" as const } },
                { document: { filename: { contains: query.q, mode: "insensitive" as const } } },
              ],
            }
          : {}),
        ...(query.minConfidence !== undefined || query.maxConfidence !== undefined
          ? { overallConfidence: { gte: query.minConfidence, lte: query.maxConfidence } }
          : {}),
        ...(query.band === "high" ? { overallConfidence: { gte: 0.85 } } : {}),
        ...(query.band === "medium" ? { overallConfidence: { gte: 0.7, lt: 0.85 } } : {}),
        ...(query.band === "review" ? { status: "REVIEW_REQUIRED" as const } : {}),
        ...(query.answered === "true" ? { answer: { is: { status: "MATCHED" as const } } } : {}),
        ...(query.answered === "false"
          ? {
              OR: [
                { answer: { is: null } },
                { answer: { is: { status: { in: ["MISSING", "UNCERTAIN"] } } } },
              ],
            }
          : {}),
        ...(query.pageNumber ? { sourcePages: { has: query.pageNumber } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.question.findMany({
          where,
          include: {
            options: { orderBy: { sortOrder: "asc" } },
            answer: true,
            reviewItems: true,
            document: { select: { filename: true, processingVersion: true } },
          },
          orderBy: [{ createdAt: "desc" }, { sortOrder: "asc" }],
          skip,
          take: limit,
        }),
        prisma.question.count({ where }),
      ]);
      const current = items.filter((q) => q.processingVersion === q.document.processingVersion);
      return paginated(
        current.map((q) => ({ ...serializeQuestion(q), documentFilename: q.document.filename })),
        total,
        page,
        limit,
      );
    },
  );

  app.get(
    "/api/v1/questions/:id",
    { schema: { tags: ["Questions"], summary: "Get question inspector payload" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const question = await requireQuestion(user.id, id);
      return { question: serializeQuestion(question) };
    },
  );

  app.patch(
    "/api/v1/questions/:id",
    { schema: { tags: ["Questions"], summary: "Edit an extracted question" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const question = await requireQuestion(user.id, id);
      const body = updateQuestionBody.parse(request.body);

      const updated = await prisma.$transaction(async (tx) => {
        if (body.options) {
          await tx.questionOption.deleteMany({ where: { questionId: question.id } });
          await tx.questionOption.createMany({
            data: body.options.map((option, index) => ({
              questionId: question.id,
              label: option.label,
              text: option.text,
              confidence: 1,
              sortOrder: index,
            })),
          });
        }
        if (body.answerValue !== undefined) {
          await tx.answer.upsert({
            where: { questionId: question.id },
            update: {
              value: body.answerValue,
              status: body.answerValue ? "MATCHED" : "MISSING",
              confidence: body.answerValue ? 1 : 0,
            },
            create: {
              questionId: question.id,
              value: body.answerValue,
              status: body.answerValue ? "MATCHED" : "MISSING",
              confidence: body.answerValue ? 1 : 0,
            },
          });
        }
        return tx.question.update({
          where: { id: question.id },
          data: {
            questionText: body.questionText ?? question.questionText,
            questionType: body.questionType ?? question.questionType,
            questionNumber: body.questionNumber ?? question.questionNumber,
            status: "VERIFIED",
          },
          include: { options: { orderBy: { sortOrder: "asc" } }, answer: true, reviewItems: true },
        });
      });

      return { question: serializeQuestion(updated) };
    },
  );

  app.get(
    "/api/v1/questions/:id/neighbors",
    { schema: { tags: ["Questions"], summary: "Previous and next question in the document" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const question = await requireQuestion(user.id, id);
      const [prev, next] = await Promise.all([
        prisma.question.findFirst({
          where: {
            documentId: question.documentId,
            processingVersion: question.processingVersion,
            sortOrder: { lt: question.sortOrder },
          },
          orderBy: { sortOrder: "desc" },
          select: { id: true, questionNumber: true },
        }),
        prisma.question.findFirst({
          where: {
            documentId: question.documentId,
            processingVersion: question.processingVersion,
            sortOrder: { gt: question.sortOrder },
          },
          orderBy: { sortOrder: "asc" },
          select: { id: true, questionNumber: true },
        }),
      ]);
      if (!prev && !next && !question) {
        throw new AppError("QUESTION_NOT_FOUND", "Question was not found.", 404);
      }
      return { previous: prev, next };
    },
  );
}
