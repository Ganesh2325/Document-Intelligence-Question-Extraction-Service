import type { AnswerStatus } from "@folio/types";
import { normalizeQuestionNumber } from "./question-patterns.js";
import type { NormalizedAnswer } from "./answer-normalizer.js";

export interface MatchableQuestion {
  questionNumber: string;
}

export interface AnswerMatch {
  questionNumber: string;
  value: string | null;
  status: AnswerStatus;
  confidence: number;
  reason?: string;
  sourceRaw?: string;
  format?: string;
}

/**
 * Match answers by question number only.
 * If two key entries disagree, or the mapping is ambiguous, the answer is UNCERTAIN and value is null.
 * This function never invents an answer.
 */
export function matchAnswers(
  questions: MatchableQuestion[],
  keyEntries: NormalizedAnswer[],
): AnswerMatch[] {
  const byNumber = new Map<string, NormalizedAnswer[]>();
  for (const entry of keyEntries) {
    const num = normalizeQuestionNumber(entry.questionNumber);
    const list = byNumber.get(num) ?? [];
    list.push(entry);
    byNumber.set(num, list);
  }

  return questions.map((question) => {
    const num = normalizeQuestionNumber(question.questionNumber);
    const entries = byNumber.get(num) ?? [];

    if (entries.length === 0) {
      return {
        questionNumber: num,
        value: null,
        status: "MISSING" as const,
        confidence: 0,
        reason: "No answer-key entry for this question number.",
      };
    }

    const values = new Set(entries.map((e) => e.value));
    if (values.size > 1 || entries.some((e) => e.format === "conflict")) {
      return {
        questionNumber: num,
        value: null,
        status: "UNCERTAIN" as const,
        confidence: 0.2,
        reason: "Answer key contains conflicting values for this question.",
        sourceRaw: entries.map((e) => e.raw).join(" | "),
      };
    }

    const entry = entries[0]!;
    if (!entry.value) {
      return {
        questionNumber: num,
        value: null,
        status: "UNCERTAIN" as const,
        confidence: 0.1,
        reason: "Answer key entry could not be normalized.",
        sourceRaw: entry.raw,
      };
    }

    return {
      questionNumber: num,
      value: entry.value,
      status: "MATCHED" as const,
      confidence: entries.length === 1 ? 0.92 : 0.8,
      sourceRaw: entry.raw,
      format: entry.format,
    };
  });
}
