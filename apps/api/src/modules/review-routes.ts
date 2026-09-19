import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@folio/shared";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../lib/pagination.js";
import { authenticate } from "../plugins/auth.js";
import { paginationQuery, reviewActionBody } from "./schemas.js";
import { serializeReview } from "./serializers.js";

const reviewListQuery = paginationQuery.extend({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  documentId: z.string().uuid().optional(),
});

const reviewPatchBody = reviewActionBody.extend({
  status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"]),
});

export async function reviewRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/review-items",
    { schema: { tags: ["Review"], summary: "List review queue" } },
    async (request) => {
      const user = await authenticate(request);
      const query = reviewListQuery.parse(request.query);
      const { page, limit, skip } = parsePagination(query);
      const where = {
        document: { ownerId: user.id },
        ...(query.status ? { status: query.status } : {}),
        ...(query.severity ? { severity: query.severity } : {}),
        ...(query.documentId ? { documentId: query.documentId } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.reviewItem.findMany({
          where,
          include: {
            question: {
              select: {
                id: true,
                questionNumber: true,
                questionText: true,
                overallConfidence: true,
                startPage: true,
                endPage: true,
              },
            },
          },
          orderBy: [{ status: "asc" }, { severity: "asc" }, { createdAt: "desc" }],
          skip,
          take: limit,
        }),
        prisma.reviewItem.count({ where }),
      ]);
      return paginated(items.map(serializeReview), total, page, limit);
    },
  );

  app.post("/api/v1/review-items/:id/approve", { schema: { tags: ["Review"], summary: "Approve a review item" } }, async (request) =>
    mutateReview(request, "RESOLVED", "VERIFIED"),
  );

  app.post("/api/v1/review-items/:id/dismiss", { schema: { tags: ["Review"], summary: "Dismiss a review item" } }, async (request) =>
    mutateReview(request, "DISMISSED"),
  );

  app.post("/api/v1/review-items/:id/resolve", { schema: { tags: ["Review"], summary: "Resolve a review item" } }, async (request) =>
    mutateReview(request, "RESOLVED", "VERIFIED"),
  );

  app.patch(
    "/api/v1/review-items/:id",
    { schema: { tags: ["Review"], summary: "Update review status" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const body = reviewPatchBody.parse(request.body);
      const item = await prisma.reviewItem.findFirst({
        where: { id, document: { ownerId: user.id } },
      });
      if (!item) throw new AppError("REVIEW_ITEM_NOT_FOUND", "Review item was not found.", 404);
      const updated = await prisma.reviewItem.update({
        where: { id: item.id },
        data: {
          status: body.status,
          resolution: body.resolution,
          actorId: user.id,
          resolvedAt: body.status === "RESOLVED" || body.status === "DISMISSED" ? new Date() : null,
        },
        include: questionInclude,
      });
      return { reviewItem: serializeReview(updated) };
    },
  );
}

const questionInclude = {
  question: {
    select: {
      id: true,
      questionNumber: true,
      questionText: true,
      overallConfidence: true,
      startPage: true,
      endPage: true,
    },
  },
} as const;

async function mutateReview(
  request: { params: unknown; body: unknown; jwtVerify: () => Promise<unknown> },
  status: "RESOLVED" | "DISMISSED",
  questionStatus?: "VERIFIED" | "EXTRACTED",
) {
  const user = await authenticate(request as never);
  const { id } = request.params as { id: string };
  const body = reviewActionBody.parse(request.body ?? {});
  const item = await prisma.reviewItem.findFirst({
    where: { id, document: { ownerId: user.id } },
  });
  if (!item) throw new AppError("REVIEW_ITEM_NOT_FOUND", "Review item was not found.", 404);

  const updated = await prisma.$transaction(async (tx) => {
    if (questionStatus) {
      await tx.question.update({ where: { id: item.questionId }, data: { status: questionStatus } });
    }
    return tx.reviewItem.update({
      where: { id: item.id },
      data: {
        status,
        resolution: body.resolution ?? (status === "DISMISSED" ? "Dismissed by reviewer" : "Approved by reviewer"),
        actorId: user.id,
        resolvedAt: new Date(),
      },
      include: questionInclude,
    });
  });

  const open = await prisma.reviewItem.count({
    where: { documentId: item.documentId, status: { in: ["OPEN", "IN_REVIEW"] } },
  });
  if (open === 0) {
    const remaining = await prisma.reviewItem.count({
      where: { documentId: item.documentId, question: { status: "REVIEW_REQUIRED" } },
    });
    await prisma.document.update({
      where: { id: item.documentId },
      data: {
        reviewCount: open,
        ...(remaining === 0 ? { status: "COMPLETED" } : {}),
      },
    });
  }

  return { reviewItem: serializeReview(updated) };
}
