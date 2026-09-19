import type { Answer, Document, ProcessingJob, Question, QuestionOption, ReviewItem } from "@prisma/client";

export function serializeDocument(doc: Document) {
  return {
    id: doc.id,
    ownerId: doc.ownerId,
    filename: doc.filename,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    status: doc.status,
    currentStage: doc.currentStage,
    progress: doc.progress,
    pageCount: doc.pageCount,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    failureReason: doc.failureReason,
    failureCode: doc.failureCode,
    retryCount: doc.retryCount,
    processingDurationMs: doc.processingDurationMs,
    processingVersion: doc.processingVersion,
    averageConfidence: doc.averageConfidence,
    highConfidenceCount: doc.highConfidenceCount,
    reviewCount: doc.reviewCount,
    questionCount: doc.questionCount,
    detectedAsAnswerKey: doc.detectedAsAnswerKey,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function serializeJob(job: ProcessingJob) {
  return {
    id: job.id,
    documentId: job.documentId,
    queueName: job.queueName,
    stage: job.stage,
    status: job.status,
    attempt: job.attempt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    durationMs: job.durationMs,
    error: job.error,
    createdAt: job.createdAt,
  };
}

export function serializeQuestion(
  question: Question & {
    options?: QuestionOption[];
    answer?: {
      value: string | null;
      confidence: number | null;
      status: string;
      sources?: Array<{ pages: number[]; rawText: string | null; format: string | null; documentId: string }>;
    } | null;
    reviewItems?: ReviewItem[];
  },
) {
  return {
    id: question.id,
    documentId: question.documentId,
    questionNumber: question.questionNumber,
    questionText: question.questionText,
    questionType: question.questionType,
    status: question.status,
    options: (question.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      text: o.text,
      confidence: o.confidence,
    })),
    answer: question.answer
      ? {
          value: question.answer.value,
          confidence: question.answer.confidence,
          status: question.answer.status,
          sourcePages: question.answer.sources?.flatMap((s) => s.pages) ?? [],
          sources: question.answer.sources ?? [],
        }
      : null,
    source: {
      documentId: question.documentId,
      pages: question.sourcePages,
      regions: question.sourceRegions,
    },
    confidence: {
      overall: question.overallConfidence,
      text: question.textConfidence,
      options: question.optionsConfidence,
      answer: question.answerConfidence,
      sourceMapping: question.sourceMappingConfidence,
      boundary: question.boundaryConfidence,
      numbering: question.numberingConfidence,
    },
    warnings: question.warnings,
    startPage: question.startPage,
    endPage: question.endPage,
    reviewState: (question.reviewItems ?? []).some((r) => r.status === "OPEN" || r.status === "IN_REVIEW")
      ? "NEEDS_REVIEW"
      : question.status,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
}

export function serializeReview(
  item: ReviewItem & {
    question?: Pick<Question, "id" | "questionNumber" | "questionText" | "overallConfidence" | "startPage" | "endPage"> | null;
  },
) {
  return {
    id: item.id,
    documentId: item.documentId,
    questionId: item.questionId,
    severity: item.severity,
    reason: item.reason,
    code: item.code,
    confidence: item.confidence,
    status: item.status,
    resolution: item.resolution,
    resolvedAt: item.resolvedAt,
    createdAt: item.createdAt,
    question: item.question
      ? {
          id: item.question.id,
          questionNumber: item.question.questionNumber,
          questionText: item.question.questionText,
          overallConfidence: item.question.overallConfidence,
          startPage: item.question.startPage,
          endPage: item.question.endPage,
        }
      : undefined,
  };
}

export function serializeAnswer(answer: Answer & { question: Pick<Question, "id" | "questionNumber" | "documentId"> }) {
  return {
    id: answer.id,
    questionId: answer.questionId,
    documentId: answer.question.documentId,
    questionNumber: answer.question.questionNumber,
    value: answer.value,
    confidence: answer.confidence,
    status: answer.status,
  };
}
