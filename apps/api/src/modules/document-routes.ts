import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { AppError, sanitizeFilename, validateUpload } from "@folio/shared";
import { loadEnv } from "@folio/config";
import { prisma } from "../lib/prisma.js";
import { paginated, parsePagination } from "../lib/pagination.js";
import { authenticate, requireDocument } from "../plugins/auth.js";
import { buildStorageKey, deleteObject, getObjectBuffer, putObject } from "../lib/storage.js";
import { enqueueDocumentProcessing } from "../lib/queue.js";
import { documentListQuery } from "./schemas.js";
import { serializeDocument, serializeJob, serializeQuestion } from "./serializers.js";

export async function documentRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/documents",
    {
      schema: { tags: ["Documents"], summary: "Upload a document" },
    },
    async (request, reply) => {
      const user = await authenticate(request);
      const env = loadEnv();
      const file = await request.file();
      if (!file) {
        throw new AppError("MISSING_FILE", "A file part named 'file' is required.", 400);
      }
      const buffer = await file.toBuffer();
      const filename = sanitizeFilename(file.filename || "upload");
      const validation = validateUpload({
        filename,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
        buffer,
        maxBytes: env.MAX_FILE_SIZE,
      });
      if (!validation.ok) {
        throw new AppError(validation.code ?? "INVALID_UPLOAD", validation.message ?? "Upload was rejected.", 400);
      }

      const extension = extname(filename).toLowerCase() || ".bin";
      const storageKey = buildStorageKey(user.id, extension);
      const document = await prisma.document.create({
        data: {
          ownerId: user.id,
          filename,
          mimeType: validation.detectedMime ?? file.mimetype,
          sizeBytes: buffer.length,
          storageKey,
          status: "UPLOADING",
          currentStage: "upload",
          progress: 5,
        },
      });

      try {
        await putObject(storageKey, buffer, document.mimeType);
      } catch (error) {
        await prisma.document.update({
          where: { id: document.id },
          data: {
            status: "FAILED",
            failureCode: "STORAGE_FAILURE",
            failureReason: "The document could not be stored.",
          },
        });
        request.log.error({ err: error, documentId: document.id }, "document_storage_failed");
        throw new AppError("STORAGE_FAILURE", "The document could not be stored. Try again.", 503, { retryable: true });
      }

      const uploaded = await prisma.document.update({
        where: { id: document.id },
        data: { status: "UPLOADED", progress: 8 },
      });

      request.log.info({ documentId: document.id, userId: user.id, filename }, "document_uploaded");
      return reply.status(201).send({ document: serializeDocument(uploaded) });
    },
  );

  app.get(
    "/api/v1/documents",
    { schema: { tags: ["Documents"], summary: "List documents" } },
    async (request) => {
      const user = await authenticate(request);
      const query = documentListQuery.parse(request.query);
      const { page, limit, skip } = parsePagination(query);
      const where = {
        ownerId: user.id,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.q
          ? { filename: { contains: query.q, mode: "insensitive" as const } }
          : {}),
      };
      const [items, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.document.count({ where }),
      ]);
      return paginated(items.map(serializeDocument), total, page, limit);
    },
  );

  app.get(
    "/api/v1/documents/:id",
    { schema: { tags: ["Documents"], summary: "Get document" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const jobs = await prisma.processingJob.findMany({
        where: { documentId: document.id },
        orderBy: { createdAt: "asc" },
      });
      return { document: serializeDocument(document), jobs: jobs.map(serializeJob) };
    },
  );

  app.delete(
    "/api/v1/documents/:id",
    { schema: { tags: ["Documents"], summary: "Delete document" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      await prisma.document.delete({ where: { id: document.id } });
      try {
        await deleteObject(document.storageKey);
      } catch {
        request.log.warn({ documentId: document.id }, "document_storage_cleanup_failed");
      }
      return reply.status(204).send();
    },
  );

  app.post(
    "/api/v1/documents/:id/process",
    { schema: { tags: ["Processing"], summary: "Queue document processing" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const nextVersion = document.processingVersion + 1;
      let jobId: string;
      try {
        jobId = await enqueueDocumentProcessing({
          documentId: document.id,
          ownerId: user.id,
          processingVersion: nextVersion,
          requestedAt: new Date().toISOString(),
        });
      } catch (error) {
        request.log.error({ err: error, documentId: document.id }, "job_enqueue_failed");
        throw new AppError(
          "QUEUE_UNAVAILABLE",
          "The processing queue is unavailable. The document was stored but not queued.",
          503,
          { retryable: true },
        );
      }
      const updated = await prisma.document.update({
        where: { id: document.id },
        data: {
          status: "QUEUED",
          currentStage: "validation",
          progress: 10,
          startedAt: new Date(),
          completedAt: null,
          failureReason: null,
          failureCode: null,
          processingVersion: nextVersion,
          retryCount: document.status === "FAILED" ? document.retryCount + 1 : document.retryCount,
        },
      });
      await prisma.processingJob.create({
        data: {
          documentId: document.id,
          queueName: "document-processing",
          bullJobId: jobId,
          stage: "validation",
          status: "QUEUED",
        },
      });
      request.log.info({ documentId: document.id, jobId, processingVersion: nextVersion }, "job_queued");
      return { document: serializeDocument(updated), jobId };
    },
  );

  app.post(
    "/api/v1/documents/:id/cancel",
    { schema: { tags: ["Processing"], summary: "Cancel processing" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const updated = await prisma.document.update({
        where: { id: document.id },
        data: { status: "CANCELLED", currentStage: "cancelled", completedAt: new Date() },
      });
      return { document: serializeDocument(updated) };
    },
  );

  app.get(
    "/api/v1/documents/:id/status",
    { schema: { tags: ["Processing"], summary: "Processing status" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const jobs = await prisma.processingJob.findMany({
        where: { documentId: document.id },
        orderBy: { createdAt: "asc" },
      });
      return {
        documentId: document.id,
        status: document.status,
        currentStage: document.currentStage,
        progress: document.progress,
        startedAt: document.startedAt,
        completedAt: document.completedAt,
        failureReason: document.failureReason,
        failureCode: document.failureCode,
        retryCount: document.retryCount,
        processingDurationMs: document.processingDurationMs,
        questionCount: document.questionCount,
        reviewCount: document.reviewCount,
        averageConfidence: document.averageConfidence,
        jobs: jobs.map(serializeJob),
      };
    },
  );

  app.get(
    "/api/v1/documents/:id/pages",
    { schema: { tags: ["Documents"], summary: "List document pages" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const pages = await prisma.documentPage.findMany({
        where: { documentId: document.id },
        orderBy: { pageNumber: "asc" },
        select: {
          id: true,
          pageNumber: true,
          hasSelectableText: true,
          usedOcr: true,
          ocrConfidence: true,
          width: true,
          height: true,
          storageKey: true,
        },
      });
      return {
        items: pages.map((p) => ({
          id: p.id,
          pageNumber: p.pageNumber,
          hasSelectableText: p.hasSelectableText,
          usedOcr: p.usedOcr,
          ocrConfidence: p.ocrConfidence,
          width: p.width,
          height: p.height,
          hasPreview: Boolean(p.storageKey),
        })),
      };
    },
  );

  app.get(
    "/api/v1/documents/:id/pages/:pageNumber/image",
    { schema: { tags: ["Documents"], summary: "Page preview image" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id, pageNumber } = request.params as { id: string; pageNumber: string };
      const document = await requireDocument(user.id, id);
      const page = await prisma.documentPage.findFirst({
        where: { documentId: document.id, pageNumber: Number(pageNumber) },
      });
      if (!page?.storageKey) {
        throw new AppError("PAGE_PREVIEW_UNAVAILABLE", "No preview image is available for this page.", 404);
      }
      const buffer = await getObjectBuffer(page.storageKey);
      return reply.type("image/png").send(buffer);
    },
  );

  app.get(
    "/api/v1/documents/:id/download",
    { schema: { tags: ["Documents"], summary: "Download original document" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const buffer = await getObjectBuffer(document.storageKey);
      return reply
        .header("Content-Disposition", `attachment; filename="${document.filename}"`)
        .type(document.mimeType)
        .send(buffer);
    },
  );

  app.get(
    "/api/v1/documents/:id/questions",
    { schema: { tags: ["Questions"], summary: "List questions in a document" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const parsed = (await import("./schemas.js")).questionListQuery.parse(request.query);
      const { page, limit, skip } = parsePagination(parsed, 50);
      const where = {
        documentId: document.id,
        processingVersion: document.processingVersion,
        ...(parsed.status ? { status: parsed.status as never } : {}),
        ...(parsed.type ? { questionType: parsed.type as never } : {}),
        ...(parsed.q
          ? {
              OR: [
                { questionText: { contains: parsed.q, mode: "insensitive" as const } },
                { questionNumber: { contains: parsed.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
        ...(parsed.minConfidence !== undefined || parsed.maxConfidence !== undefined
          ? {
              overallConfidence: {
                gte: parsed.minConfidence,
                lte: parsed.maxConfidence,
              },
            }
          : {}),
        ...(parsed.pageNumber ? { sourcePages: { has: parsed.pageNumber } } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.question.findMany({
          where,
          include: { options: { orderBy: { sortOrder: "asc" } }, answer: true, reviewItems: true },
          orderBy: { sortOrder: "asc" },
          skip,
          take: limit,
        }),
        prisma.question.count({ where }),
      ]);
      return paginated(items.map(serializeQuestion), total, page, limit);
    },
  );

  app.get(
    "/api/v1/documents/:id/questions/export",
    { schema: { tags: ["Questions"], summary: "Export extracted questions" } },
    async (request, reply) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const format = ((request.query as { format?: string }).format ?? "json").toLowerCase();
      const questions = await prisma.question.findMany({
        where: { documentId: document.id, processingVersion: document.processingVersion },
        include: { options: { orderBy: { sortOrder: "asc" } }, answer: true },
        orderBy: { sortOrder: "asc" },
      });
      const payload = questions.map((q) => serializeQuestion(q));
      if (format === "csv") {
        const header = ["number", "type", "text", "options", "answer", "confidence", "pages", "status"];
        const rows = payload.map((q) =>
          [
            q.questionNumber,
            q.questionType,
            csvEscape(q.questionText),
            csvEscape((q.options ?? []).map((o) => `${o.label}. ${o.text}`).join(" | ")),
            q.answer?.value ?? "",
            q.confidence.overall,
            q.source.pages.join("-"),
            q.status,
          ].join(","),
        );
        return reply
          .header("Content-Disposition", `attachment; filename="${document.filename}-questions.csv"`)
          .type("text/csv")
          .send([header.join(","), ...rows].join("\n"));
      }
      return reply
        .header("Content-Disposition", `attachment; filename="${document.filename}-questions.json"`)
        .send({ documentId: document.id, filename: document.filename, questions: payload });
    },
  );

  app.get(
    "/api/v1/documents/:id/answers",
    { schema: { tags: ["Answers"], summary: "List answers for a document" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const answers = await prisma.answer.findMany({
        where: { question: { documentId: document.id, processingVersion: document.processingVersion } },
        include: { question: { select: { id: true, questionNumber: true, documentId: true } }, sources: true },
        orderBy: { question: { sortOrder: "asc" } },
      });
      return {
        items: answers.map((a) => ({
          id: a.id,
          questionId: a.questionId,
          questionNumber: a.question.questionNumber,
          value: a.value,
          confidence: a.confidence,
          status: a.status,
          sources: a.sources,
        })),
      };
    },
  );

  app.get(
    "/api/v1/documents/:id/review-items",
    { schema: { tags: ["Review"], summary: "List review items for a document" } },
    async (request) => {
      const user = await authenticate(request);
      const { id } = request.params as { id: string };
      const document = await requireDocument(user.id, id);
      const items = await prisma.reviewItem.findMany({
        where: { documentId: document.id, question: { processingVersion: document.processingVersion } },
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
        orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      });
      const { serializeReview } = await import("./serializers.js");
      return { items: items.map(serializeReview) };
    },
  );
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
