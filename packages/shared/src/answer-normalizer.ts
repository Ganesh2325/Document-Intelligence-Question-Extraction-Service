import { matchAnswerEntry, normalizeAnswerValue, normalizeQuestionNumber, parseInlineAnswerKey } from "./question-patterns.js";

export interface NormalizedAnswer {
  questionNumber: string;
  value: string;
  raw: string;
  format: string;
}

export function normalizeAnswerKeyText(text: string): NormalizedAnswer[] {
  const seen = new Map<string, NormalizedAnswer>();
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const pieces = line.split(/[;,|]/);
    for (const piece of pieces) {
      const match = matchAnswerEntry(piece);
      if (match) {
        upsert(seen, {
          questionNumber: match.questionNumber,
          value: match.value,
          raw: match.raw,
          format: match.format,
        });
      }
    }
  }

  if (seen.size === 0) {
    for (const entry of parseInlineAnswerKey(text)) {
      upsert(seen, entry);
    }
  }

  return [...seen.values()].sort(
    (a, b) => Number.parseInt(a.questionNumber, 10) - Number.parseInt(b.questionNumber, 10),
  );
}

function upsert(seen: Map<string, NormalizedAnswer>, entry: NormalizedAnswer) {
  const key = normalizeQuestionNumber(entry.questionNumber);
  const existing = seen.get(key);
  if (!existing) {
    seen.set(key, { ...entry, questionNumber: key, value: normalizeAnswerValue(entry.value) });
    return;
  }
  if (existing.value !== normalizeAnswerValue(entry.value)) {
    seen.set(key, {
      ...existing,
      value: existing.value,
      format: "conflict",
      raw: `${existing.raw} | ${entry.raw}`,
    });
  }
}

export { normalizeAnswerValue, normalizeQuestionNumber };
