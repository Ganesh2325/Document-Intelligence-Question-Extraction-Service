import type { DocumentStatus, ProcessingStage } from "@folio/types";

export const STAGE_PROGRESS: Record<ProcessingStage, number> = {
  upload: 5,
  validation: 12,
  preprocessing: 22,
  ocr: 40,
  structure: 52,
  questions: 70,
  answers: 82,
  validation_results: 90,
  persist: 100,
};

export const STATUS_FOR_STAGE: Record<ProcessingStage, DocumentStatus> = {
  upload: "UPLOADED",
  validation: "VALIDATING",
  preprocessing: "PREPROCESSING",
  ocr: "OCR_PROCESSING",
  structure: "STRUCTURE_ANALYSIS",
  questions: "QUESTION_EXTRACTION",
  answers: "ANSWER_ANALYSIS",
  validation_results: "VALIDATING_RESULTS",
  persist: "COMPLETED",
};

export function isActiveStatus(status: DocumentStatus): boolean {
  return ![
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "FAILED",
    "CANCELLED",
    "REVIEW_REQUIRED",
    "UPLOADED",
  ].includes(status);
}
