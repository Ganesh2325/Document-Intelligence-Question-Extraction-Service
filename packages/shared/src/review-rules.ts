import type { ReviewSeverity } from "@folio/types";
import type { ExtractedQuestion } from "./question-extractor.js";
import type { AnswerMatch } from "./answer-matcher.js";
import { confidenceBand } from "./confidence.js";

export interface ReviewCandidate {
  code: string;
  reason: string;
  severity: ReviewSeverity;
  confidence: number;
}

export function buildReviewCandidates(
  question: ExtractedQuestion,
  overallConfidence: number,
  answer?: AnswerMatch,
  ocrConfidence?: number,
): ReviewCandidate[] {
  const items: ReviewCandidate[] = [];

  if (ocrConfidence !== undefined && ocrConfidence < 0.6) {
    items.push({
      code: "LOW_OCR",
      reason: "OCR quality is poor on one or more source pages.",
      severity: "HIGH",
      confidence: ocrConfidence,
    });
  }

  if (question.boundaryConfidence < 0.7) {
    items.push({
      code: "UNCERTAIN_BOUNDARY",
      reason: "Question boundary is uncertain.",
      severity: "HIGH",
      confidence: question.boundaryConfidence,
    });
  }

  if (question.incomplete) {
    items.push({
      code: "INCOMPLETE",
      reason: "Question appears incomplete or partially extracted.",
      severity: "HIGH",
      confidence: overallConfidence,
    });
  }

  if (
    (question.questionType === "MCQ" || question.questionType === "MULTI_SELECT") &&
    question.options.length > 0 &&
    question.options.length < 4
  ) {
    items.push({
      code: "AMBIGUOUS_OPTIONS",
      reason: "Options are incomplete or ambiguous.",
      severity: "MEDIUM",
      confidence: question.options.reduce((s, o) => s + o.confidence, 0) / question.options.length,
    });
  }

  if (answer?.status === "UNCERTAIN") {
    items.push({
      code: "ANSWER_CONFLICT",
      reason: answer.reason ?? "Answer key could not be matched unambiguously.",
      severity: "HIGH",
      confidence: answer.confidence,
    });
  }

  if (answer?.status === "MISSING" && answer.reason?.includes("key")) {
    items.push({
      code: "ANSWER_UNMATCHED",
      reason: "An answer key was present but this question number was not matched.",
      severity: "MEDIUM",
      confidence: 0.4,
    });
  }

  if (question.sourcePages.length > 1 && question.boundaryConfidence < 0.85) {
    items.push({
      code: "MULTIPAGE_UNCERTAIN",
      reason: "Question spans pages and reconstruction confidence is limited.",
      severity: "MEDIUM",
      confidence: question.boundaryConfidence,
    });
  }

  if (question.questionType === "UNKNOWN") {
    items.push({
      code: "UNKNOWN_TYPE",
      reason: "Question type could not be identified with confidence.",
      severity: "LOW",
      confidence: question.typeConfidence,
    });
  }

  if (confidenceBand(overallConfidence) === "review") {
    items.push({
      code: "LOW_CONFIDENCE",
      reason: "Overall extraction confidence is below the review threshold.",
      severity: "MEDIUM",
      confidence: overallConfidence,
    });
  }

  return dedupe(items);
}

function dedupe(items: ReviewCandidate[]): ReviewCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}
