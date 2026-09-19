import type { QuestionType } from "@folio/types";

export interface TypeSignals {
  questionText: string;
  optionLabels: string[];
  optionTexts: string[];
}

export function detectQuestionType(signals: TypeSignals): { type: QuestionType; confidence: number } {
  const text = signals.questionText.toLowerCase();
  const labels = signals.optionLabels.map((l) => l.toUpperCase());
  const optionText = signals.optionTexts.join(" ").toLowerCase();

  const trueFalseOptions =
    labels.length === 2 &&
    ((/true/.test(optionText) && /false/.test(optionText)) ||
      (labels.includes("T") && labels.includes("F")));

  if (/\btrue\s*\/\s*false\b|\btrue or false\b/.test(text) || trueFalseOptions) {
    return { type: "TRUE_FALSE", confidence: 0.93 };
  }

  if (
    /\bselect all that apply\b|\bchoose all\b|\bmore than one\b|\bwhich of the following are\b/.test(text)
  ) {
    return { type: "MULTI_SELECT", confidence: labels.length >= 2 ? 0.9 : 0.7 };
  }

  if (/_{3,}|\.{4,}|\[\s*\]|fill in the blank/.test(text)) {
    return { type: "FILL_IN_THE_BLANK", confidence: 0.88 };
  }

  if (labels.length >= 2) {
    return { type: "MCQ", confidence: labels.length >= 4 ? 0.94 : 0.8 };
  }

  if (/\b(explain|describe|discuss|elaborate|write an essay|justify)\b/.test(text)) {
    return { type: "LONG_ANSWER", confidence: 0.86 };
  }

  if (/\b(briefly|in brief|short note|define|name|state|give reason)\b/.test(text)) {
    return { type: "SHORT_ANSWER", confidence: 0.82 };
  }

  if (labels.length === 0 && text.length > 40) {
    return { type: "UNKNOWN", confidence: 0.4 };
  }

  return { type: "UNKNOWN", confidence: 0.35 };
}
