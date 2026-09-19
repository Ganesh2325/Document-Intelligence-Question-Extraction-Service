import {
  type DocumentJobPayload,
  PermanentProcessingError,
  TransientProcessingError,
  buildReviewCandidates,
  calculateConfidence,
  confidenceBand,
  extractQuestionsFromPages,
  isTransientError,
  matchAnswers,
  normalizeAnswerKeyText,
  optionConfidence,
  STAGE_PROGRESS,
  type ExtractionResult,
  type PageContent,
} from "@folio/shared";
import type { ProcessingStage } from "@folio/types";
import { UnrecoverableError } from "bullmq";
import { loadEnv } from "@folio/config";
import { prisma } from "../lib/prisma.js";
import { deleteObject, getObjectBuffer, putObject } from "../lib/storage.js";
import { logger } from "../lib/logger.js";
import { getTextExtractor } from "../providers/text/index.js";
import { getOcrProvider } from "../providers/ocr/index.js";
import { getAnswerKeyExtractor, getQuestionExtractor, describeProviders } from "../providers/ai/index.js";
import { imageToPng, renderPdfPage } from "../providers/vision/render.js";

const STAGE_ORDER: ProcessingStage[] = [
  "validation",
  "preprocessing",
  "ocr",
  "structure",
  "questions",
  "answers",
  "validation_results",
  "persist",
];

export async function processDocumentJob(payload: DocumentJobPayload, attempt: number) {
  const started = Date.now();
  const document = await prisma.document.findUnique({ where: { id: payload.documentId } });
  if (!document) {
    throw new UnrecoverableError(`Document ${payload.documentId} was not found.`);
  }
  if (document.status === "CANCELLED") {
    logger.info({ documentId: document.id }, "processing_skipped_cancelled");
    return;
  }
  if (document.processingVersion !== payload.processingVersion) {
    logger.info(
      { documentId: document.id, jobVersion: payload.processingVersion, current: document.processingVersion },
      "processing_skipped_stale_version",
    );
    return;
  }

  logger.info(
    { documentId: document.id, version: payload.processingVersion, providers: describeProviders(), attempt },
    "document_processing_started",
  );

  try {
    await markStage(document.id, "validation", attempt);
    const buffer = await getObjectBuffer(document.storageKey);
    if (buffer.length === 0) {
      throw new PermanentProcessingError("EMPTY_DOCUMENT", "The uploaded document is empty.");
    }

    await markStage(document.id, "preprocessing", attempt);
    const extractor = getTextExtractor();
    let pages = await extractor.extract(buffer, document.mimeType);
    if (pages.length === 0) {
      throw new PermanentProcessingError("EMPTY_DOCUMENT", "No pages could be detected in the document.");
    }
    const env = loadEnv();
    if (pages.length > env.MAX_PAGES) {
      throw new PermanentProcessingError(
        "TOO_MANY_PAGES",
        `Documents with more than ${env.MAX_PAGES} pages are not accepted.`,
      );
    }

    await prisma.document.update({
      where: { id: document.id },
      data: { pageCount: pages.length, metadata: { textProvider: extractor.name, mimeType: document.mimeType } },
    });

    await markStage(document.id, "ocr", attempt);
    pages = await applyOcrAndPreviews(document.id, payload.processingVersion, buffer, document.mimeType, pages);

    const emptyText = pages.every((p) => p.text.replace(/\s/g, "").length < 8);
    if (emptyText) {
      throw new PermanentProcessingError(
        "UNREADABLE_CONTENT",
        "No readable text could be extracted. The scan may be too poor quality.",
      );
    }

    await markStage(document.id, "structure", attempt);
    logger.info({ documentId: document.id, pages: pages.length }, "structure_analysis_started");

    await markStage(document.id, "questions", attempt);
    logger.info({ documentId: document.id }, "question_extraction_started");
    const questionExtractor = getQuestionExtractor();
    let extraction: ExtractionResult = await questionExtractor.extract(pages);
    if (extraction.questions.length === 0) {
      extraction = extractQuestionsFromPages(pages);
    }
    logger.info(
      { documentId: document.id, questionCount: extraction.questions.length, extractor: questionExtractor.name },
      "question_extraction_completed",
    );

    await markStage(document.id, "answers", attempt);
    logger.info({ documentId: document.id }, "answer_matching_started");
    const relatedKey = await loadRelatedAnswerKey(document.id, document.ownerId);
    const localKey = getAnswerKeyExtractor();
    const ownKey = await localKey.extract(pages);
    const combinedKeyText = [
      ...ownKey.entries.map((e) => `${e.questionNumber}-${e.value}`),
      ...relatedKey.entries,
    ].join("\n");
    const normalizedKey = normalizeAnswerKeyText(combinedKeyText || relatedKey.rawText);
    const hasKey = normalizedKey.length > 0;
    const matches = hasKey
      ? matchAnswers(
          extraction.questions.map((q) => ({ questionNumber: q.questionNumber })),
          normalizedKey,
        )
      : [];

    await markStage(document.id, "validation_results", attempt);

    await markStage(document.id, "persist", attempt);
    await persistResults({
      documentId: document.id,
      processingVersion: payload.processingVersion,
      pages,
      extraction,
      matches,
      hasKey,
      relatedKeyPages: relatedKey.pages,
      relatedDocumentId: relatedKey.documentId,
      started,
    });

    logger.info(
      { documentId: document.id, durationMs: Date.now() - started, questions: extraction.questions.length },
      "processing_completed",
    );
  } catch (error) {
    const durationMs = Date.now() - started;
    const permanent = error instanceof PermanentProcessingError || error instanceof UnrecoverableError;
    const message = error instanceof Error ? error.message : "Processing failed.";
    const code =
      error instanceof PermanentProcessingError
        ? error.code
        : error instanceof TransientProcessingError
          ? error.code
          : "PROCESSING_FAILED";

    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: permanent || attempt >= 3 ? "FAILED" : document.status,
        failureReason: message,
        failureCode: code,
        processingDurationMs: durationMs,
        completedAt: permanent || attempt >= 3 ? new Date() : document.completedAt,
      },
    });
    await prisma.processingJob.create({
      data: {
        documentId: document.id,
        queueName: "document-processing",
        stage: "failed",
        status: "FAILED",
        attempt,
        error: message,
        durationMs,
        completedAt: new Date(),
      },
    });
    logger.error({ documentId: document.id, code, err: error }, "processing_failed");

    if (permanent) {
      throw new UnrecoverableError(message);
    }
    if (isTransientError(error) || error instanceof TransientProcessingError) {
      throw error;
    }
    throw error;
  }
}

async function applyOcrAndPreviews(
  documentId: string,
  version: number,
  buffer: Buffer,
  mimeType: string,
  pages: PageContent[],
): Promise<PageContent[]> {
  const ocr = getOcrProvider();
  const updated: PageContent[] = [];
  const previousPages = await prisma.documentPage.findMany({ where: { documentId } });
  for (const prev of previousPages) {
    if (prev.storageKey) {
      try {
        await deleteObject(prev.storageKey);
      } catch {
        // best-effort cleanup of prior artifacts
      }
    }
  }
  await prisma.documentPage.deleteMany({ where: { documentId } });

  for (const page of pages) {
    let current = { ...page };
    let preview: Buffer | null = null;

    if (mimeType.startsWith("image/")) {
      const converted = await imageToPng(buffer);
      preview = converted.png;
      current = { ...current, width: converted.width, height: converted.height };
      logger.info({ documentId, page: page.pageNumber }, "ocr_started");
      const recognized = await ocr.recognize(preview, page.pageNumber);
      current = {
        ...current,
        text: recognized.text,
        items: recognized.items,
        usedOcr: true,
        hasSelectableText: false,
        ocrConfidence: recognized.confidence,
      };
      logger.info({ documentId, page: page.pageNumber, confidence: recognized.confidence }, "ocr_completed");
    } else if (!page.hasSelectableText) {
      logger.info({ documentId, page: page.pageNumber }, "ocr_started");
      preview = await renderPdfPage(buffer, page.pageNumber, 1.7);
      const recognized = await ocr.recognize(preview, page.pageNumber);
      current = {
        ...current,
        text: recognized.text,
        items: recognized.items.length ? recognized.items : current.items,
        usedOcr: true,
        ocrConfidence: recognized.confidence,
      };
      logger.info({ documentId, page: page.pageNumber, confidence: recognized.confidence }, "ocr_completed");
    } else {
      try {
        preview = await renderPdfPage(buffer, page.pageNumber, 1.15);
      } catch {
        preview = null;
      }
    }

    let storageKey: string | null = null;
    if (preview) {
      storageKey = `derived/${documentId}/v${version}/page-${page.pageNumber}.png`;
      await putObject(storageKey, preview, "image/png");
    }

    await prisma.documentPage.create({
      data: {
        documentId,
        pageNumber: page.pageNumber,
        storageKey,
        textContent: current.text.slice(0, 20_000),
        hasSelectableText: current.hasSelectableText,
        usedOcr: current.usedOcr,
        ocrConfidence: current.ocrConfidence,
        width: current.width,
        height: current.height,
      },
    });

    updated.push(current);
  }

  return updated;
}

async function loadRelatedAnswerKey(documentId: string, ownerId: string) {
  const relation = await prisma.documentRelationship.findFirst({
    where: {
      sourceDocumentId: documentId,
      type: "ANSWER_KEY_FOR",
      targetDocument: { ownerId },
    },
    include: {
      targetDocument: {
        include: { pages: { orderBy: { pageNumber: "asc" } } },
      },
    },
  });
  if (!relation) {
    return { entries: [] as string[], rawText: "", pages: [] as number[], documentId: undefined as string | undefined };
  }
  const text = relation.targetDocument.pages.map((p) => p.textContent ?? "").join("\n");
  const pages = relation.targetDocument.pages.map((p) => p.pageNumber);
  return { entries: text.split("\n"), rawText: text, pages, documentId: relation.targetDocumentId };
}

async function persistResults(input: {
  documentId: string;
  processingVersion: number;
  pages: PageContent[];
  extraction: ExtractionResult;
  matches: ReturnType<typeof matchAnswers>;
  hasKey: boolean;
  relatedKeyPages: number[];
  relatedDocumentId?: string;
  started: number;
}) {
  const matchByNumber = new Map(input.matches.map((m) => [m.questionNumber, m]));
  const pageOcr = new Map(input.pages.map((p) => [p.pageNumber, p.ocrConfidence]));

  await prisma.$transaction(async (tx) => {
    await tx.reviewItem.deleteMany({
      where: { documentId: input.documentId, question: { processingVersion: input.processingVersion } },
    });
    await tx.question.deleteMany({
      where: { documentId: input.documentId, processingVersion: input.processingVersion },
    });
    await tx.extractionWarning.deleteMany({ where: { documentId: input.documentId } });

    let reviewCount = 0;
    let highConfidenceCount = 0;
    let confidenceSum = 0;

    for (const [index, extracted] of input.extraction.questions.entries()) {
      const answerMatch = matchByNumber.get(extracted.questionNumber);
      const ocrValues = extracted.sourcePages
        .map((p) => pageOcr.get(p))
        .filter((n): n is number => typeof n === "number");
      const ocrConfidence = ocrValues.length ? ocrValues.reduce((s, n) => s + n, 0) / ocrValues.length : undefined;
      const sourceMapping = extracted.sourceRegions.length > 0 ? 0.95 : extracted.sourcePages.length > 0 ? 0.8 : 0.4;
      const confidence = calculateConfidence({
        text: extracted.incomplete ? 0.55 : 0.92,
        boundary: extracted.boundaryConfidence,
        numbering: extracted.numberingConfidence,
        options: optionConfidence(extracted.options.map((o) => o.confidence)),
        answer: answerMatch?.status === "MATCHED" ? answerMatch.confidence : 0,
        sourceMapping,
        ocr: ocrConfidence,
      });

      const reviews = buildReviewCandidates(
        extracted,
        confidence.overall,
        input.hasKey ? answerMatch : undefined,
        ocrConfidence,
      );
      const needsReview = reviews.length > 0 || confidenceBand(confidence.overall) === "review";
      if (confidenceBand(confidence.overall) === "high") highConfidenceCount += 1;
      confidenceSum += confidence.overall;

      const question = await tx.question.create({
        data: {
          documentId: input.documentId,
          processingVersion: input.processingVersion,
          sortOrder: index,
          questionNumber: extracted.questionNumber,
          questionText: extracted.questionText,
          questionType: extracted.questionType,
          status: extracted.incomplete ? "PARTIAL" : needsReview ? "REVIEW_REQUIRED" : "EXTRACTED",
          overallConfidence: confidence.overall,
          textConfidence: confidence.text,
          optionsConfidence: confidence.options,
          answerConfidence: confidence.answer,
          sourceMappingConfidence: confidence.sourceMapping,
          boundaryConfidence: confidence.boundary,
          numberingConfidence: confidence.numbering,
          startPage: extracted.startPage,
          endPage: extracted.endPage,
          sourcePages: extracted.sourcePages,
          sourceRegions: extracted.sourceRegions as object[],
          warnings: extracted.warnings,
          options: {
            create: extracted.options.map((option, optionIndex) => ({
              label: option.label,
              text: option.text,
              confidence: option.confidence,
              sortOrder: optionIndex,
            })),
          },
        },
      });

      await tx.answer.create({
        data: {
          questionId: question.id,
          value: answerMatch?.status === "MATCHED" ? answerMatch.value : null,
          confidence: answerMatch?.status === "MATCHED" ? answerMatch.confidence : 0,
          status: answerMatch?.status ?? "MISSING",
          sources:
            answerMatch?.sourceRaw
              ? {
                  create: {
                    documentId: input.relatedDocumentId ?? input.documentId,
                    pages: input.relatedKeyPages.length ? input.relatedKeyPages : extracted.sourcePages.slice(-1),
                    rawText: answerMatch.sourceRaw,
                    format: answerMatch.format,
                  },
                }
              : undefined,
        },
      });

      for (const review of reviews) {
        reviewCount += 1;
        await tx.reviewItem.create({
          data: {
            documentId: input.documentId,
            questionId: question.id,
            severity: review.severity,
            reason: review.reason,
            code: review.code,
            confidence: review.confidence,
            status: "OPEN",
          },
        });
      }

      for (const warning of extracted.warnings) {
        await tx.extractionWarning.create({
          data: {
            documentId: input.documentId,
            questionId: question.id,
            code: "EXTRACTION_WARNING",
            message: warning,
            severity: "MEDIUM",
          },
        });
      }
    }

    for (const warning of input.extraction.documentWarnings) {
      await tx.extractionWarning.create({
        data: {
          documentId: input.documentId,
          code: "DOCUMENT_WARNING",
          message: warning,
          severity: "LOW",
        },
      });
    }

    const questionCount = input.extraction.questions.length;
    const avg = questionCount ? confidenceSum / questionCount : null;
    const partial = input.extraction.questions.some((q) => q.incomplete);
    const status =
      questionCount === 0
        ? "FAILED"
        : reviewCount > 0
          ? "REVIEW_REQUIRED"
          : partial
            ? "PARTIALLY_COMPLETED"
            : "COMPLETED";

    await tx.document.update({
      where: { id: input.documentId },
      data: {
        status: questionCount === 0 ? "FAILED" : status,
        currentStage: "persist",
        progress: 100,
        completedAt: new Date(),
        processingDurationMs: Date.now() - input.started,
        averageConfidence: avg,
        highConfidenceCount,
        reviewCount,
        questionCount,
        detectedAsAnswerKey: input.extraction.detectedAsAnswerKey,
        failureReason: questionCount === 0 ? "No questions could be extracted from the document." : null,
        failureCode: questionCount === 0 ? "NO_QUESTIONS_EXTRACTED" : null,
      },
    });
  });
}

async function markStage(documentId: string, stage: ProcessingStage, attempt: number) {
  const startedAt = new Date();
  const current = await prisma.document.findUnique({ where: { id: documentId }, select: { status: true } });
  if (current?.status === "CANCELLED") {
    throw new PermanentProcessingError("CANCELLED", "Processing was cancelled.");
  }
  const statusByStage: Partial<Record<ProcessingStage, "VALIDATING" | "PREPROCESSING" | "OCR_PROCESSING" | "STRUCTURE_ANALYSIS" | "QUESTION_EXTRACTION" | "ANSWER_ANALYSIS" | "VALIDATING_RESULTS">> = {
    validation: "VALIDATING",
    preprocessing: "PREPROCESSING",
    ocr: "OCR_PROCESSING",
    structure: "STRUCTURE_ANALYSIS",
    questions: "QUESTION_EXTRACTION",
    answers: "ANSWER_ANALYSIS",
    validation_results: "VALIDATING_RESULTS",
  };
  await prisma.document.update({
    where: { id: documentId },
    data: {
      ...(statusByStage[stage] ? { status: statusByStage[stage] } : {}),
      currentStage: stage,
      progress: STAGE_PROGRESS[stage],
    },
  });
  await prisma.processingJob.create({
    data: {
      documentId,
      queueName: queueForStage(stage),
      stage,
      status: "ACTIVE",
      attempt,
      startedAt,
    },
  });
  logger.info({ documentId, stage }, `${stage}_started`);
  void STAGE_ORDER;
}

function queueForStage(stage: ProcessingStage): string {
  if (stage === "ocr") return "ocr-processing";
  if (stage === "questions") return "question-extraction";
  if (stage === "answers") return "answer-matching";
  if (stage === "validation" || stage === "validation_results") return "validation";
  return "document-processing";
}
