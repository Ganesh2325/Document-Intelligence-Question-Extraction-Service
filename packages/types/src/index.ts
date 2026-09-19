export const DOCUMENT_STATUSES = [
  "UPLOADING",
  "UPLOADED",
  "QUEUED",
  "VALIDATING",
  "PREPROCESSING",
  "OCR_PROCESSING",
  "STRUCTURE_ANALYSIS",
  "QUESTION_EXTRACTION",
  "ANSWER_ANALYSIS",
  "VALIDATING_RESULTS",
  "REVIEW_REQUIRED",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const PROCESSING_STAGES = [
  "upload",
  "validation",
  "preprocessing",
  "ocr",
  "structure",
  "questions",
  "answers",
  "validation_results",
  "persist",
] as const;

export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

export const QUESTION_TYPES = [
  "MCQ",
  "MULTI_SELECT",
  "TRUE_FALSE",
  "FILL_IN_THE_BLANK",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "UNKNOWN",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = [
  "EXTRACTED",
  "REVIEW_REQUIRED",
  "PARTIAL",
  "VERIFIED",
  "REJECTED",
] as const;

export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const ANSWER_STATUSES = ["MATCHED", "UNCERTAIN", "MISSING"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

export const REVIEW_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "DISMISSED"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const DOCUMENT_ROLES = [
  "QUESTION_PAPER",
  "ANSWER_KEY",
  "SOLUTIONS",
  "SUPPORTING",
] as const;
export type DocumentRole = (typeof DOCUMENT_ROLES)[number];

export const ACTIVE_PROCESSING_STATUSES: DocumentStatus[] = [
  "UPLOADING",
  "QUEUED",
  "VALIDATING",
  "PREPROCESSING",
  "OCR_PROCESSING",
  "STRUCTURE_ANALYSIS",
  "QUESTION_EXTRACTION",
  "ANSWER_ANALYSIS",
  "VALIDATING_RESULTS",
];

export const TERMINAL_STATUSES: DocumentStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED",
  "CANCELLED",
  "REVIEW_REQUIRED",
];

export interface SourceRegion {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QuestionSource {
  documentId: string;
  pages: number[];
  regions: SourceRegion[];
}

export interface ConfidenceBreakdown {
  overall: number;
  text: number;
  options: number;
  answer: number;
  sourceMapping: number;
  boundary: number;
  numbering: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
