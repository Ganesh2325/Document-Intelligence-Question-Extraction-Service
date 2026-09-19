import type { ConfidenceBreakdown } from "@folio/types";

export interface ConfidenceSignals {
  ocr?: number;
  text?: number;
  boundary: number;
  numbering: number;
  options: number;
  answer: number;
  sourceMapping: number;
  structural?: number;
}

/**
 * Confidence is a documented weighted combination of validated signals.
 * Missing answer signal is excluded from the denominator so unanswered
 * questions are not penalized when no key exists.
 *
 * overall =
 *   (0.22 * text + 0.18 * boundary + 0.12 * numbering +
 *    0.16 * options + 0.12 * answer? + 0.12 * sourceMapping + 0.08 * ocr?)
 *   / sum(weights actually used)
 */
export function calculateConfidence(signals: ConfidenceSignals): ConfidenceBreakdown {
  const text = clamp01(signals.text ?? signals.ocr ?? 0.7);
  const options = clamp01(signals.options);
  const answer = clamp01(signals.answer);
  const sourceMapping = clamp01(signals.sourceMapping);
  const boundary = clamp01(signals.boundary);
  const numbering = clamp01(signals.numbering);
  const ocr = signals.ocr === undefined ? undefined : clamp01(signals.ocr);

  const parts: Array<{ weight: number; value: number }> = [
    { weight: 0.22, value: text },
    { weight: 0.18, value: boundary },
    { weight: 0.12, value: numbering },
    { weight: 0.16, value: options },
    { weight: 0.12, value: sourceMapping },
  ];

  if (signals.answer > 0) {
    parts.push({ weight: 0.12, value: answer });
  }
  if (ocr !== undefined) {
    parts.push({ weight: 0.08, value: ocr });
  }

  const weightSum = parts.reduce((s, p) => s + p.weight, 0) || 1;
  const overall = parts.reduce((s, p) => s + p.weight * p.value, 0) / weightSum;

  return {
    overall: round2(overall),
    text: round2(text),
    options: round2(options),
    answer: round2(answer),
    sourceMapping: round2(sourceMapping),
    boundary: round2(boundary),
    numbering: round2(numbering),
  };
}

export function optionConfidence(optionScores: number[]): number {
  if (optionScores.length === 0) return 0.55;
  return optionScores.reduce((s, n) => s + n, 0) / optionScores.length;
}

export function confidenceBand(overall: number): "high" | "medium" | "review" {
  if (overall >= 0.85) return "high";
  if (overall >= 0.7) return "medium";
  return "review";
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
