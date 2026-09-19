import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../plugins/auth.js";
import { serializeDocument } from "./serializers.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/dashboard/stats",
    { schema: { tags: ["Dashboard"], summary: "Workspace metrics from live data" } },
    async (request) => {
      const user = await authenticate(request);
      const owner = { ownerId: user.id };

      const [
        totalDocuments,
        completedDocuments,
        processingDocuments,
        failedDocuments,
        questionsExtracted,
        reviewOpen,
        confidenceAgg,
        recentDocuments,
        activeJobs,
      ] = await Promise.all([
        prisma.document.count({ where: owner }),
        prisma.document.count({ where: { ...owner, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED", "REVIEW_REQUIRED"] } } }),
        prisma.document.count({
          where: {
            ...owner,
            status: {
              in: [
                "QUEUED",
                "VALIDATING",
                "PREPROCESSING",
                "OCR_PROCESSING",
                "STRUCTURE_ANALYSIS",
                "QUESTION_EXTRACTION",
                "ANSWER_ANALYSIS",
                "VALIDATING_RESULTS",
              ],
            },
          },
        }),
        prisma.document.count({ where: { ...owner, status: "FAILED" } }),
        prisma.question.count({ where: { document: owner } }),
        prisma.reviewItem.count({ where: { document: owner, status: { in: ["OPEN", "IN_REVIEW"] } } }),
        prisma.question.aggregate({
          where: { document: owner },
          _avg: { overallConfidence: true },
        }),
        prisma.document.findMany({
          where: owner,
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.processingJob.findMany({
          where: { document: owner, status: { in: ["QUEUED", "ACTIVE"] } },
          include: { document: { select: { filename: true, status: true, progress: true } } },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

      const processed = completedDocuments + failedDocuments;
      const successRate = processed === 0 ? null : completedDocuments / processed;
      const durationAgg = await prisma.document.aggregate({
        where: { ...owner, processingDurationMs: { not: null } },
        _avg: { processingDurationMs: true },
      });

      return {
        documentsProcessed: totalDocuments,
        completedDocuments,
        processingDocuments,
        failedDocuments,
        questionsExtracted,
        reviewRequired: reviewOpen,
        averageConfidence: confidenceAgg._avg.overallConfidence,
        processingSuccessRate: successRate,
        averageProcessingTimeMs: durationAgg._avg.processingDurationMs,
        recentDocuments: recentDocuments.map(serializeDocument),
        activeJobs: activeJobs.map((job) => ({
          id: job.id,
          documentId: job.documentId,
          filename: job.document.filename,
          stage: job.stage,
          status: job.status,
          progress: job.document.progress,
        })),
      };
    },
  );
}
