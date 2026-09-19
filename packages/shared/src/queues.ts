export const QUEUE_NAMES = {
  documentProcessing: "document-processing",
  ocrProcessing: "ocr-processing",
  questionExtraction: "question-extraction",
  answerMatching: "answer-matching",
  validation: "validation",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface DocumentJobPayload {
  documentId: string;
  ownerId: string;
  processingVersion: number;
  requestedAt: string;
}
