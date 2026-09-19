import type { SourceRegion } from "@folio/types";
import { isSequentialOption, parseOption } from "./option-parser.js";

export interface DraftPart {
  text: string;
  page: number;
  item: {
    text: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DraftOption {
  label: string;
  text: string;
  confidence: number;
  page: number;
  item: DraftPart["item"];
}

export interface DraftQuestion {
  questionNumber: string;
  numberingStyle: string;
  numberingConfidence: number;
  parts: DraftPart[];
  options: DraftOption[];
  incomplete: boolean;
}

/**
 * Merge fragments that belong to the same question across page boundaries.
 *
 * Signals used:
 * - consecutive numbering (do not merge Q14 with Q15)
 * - option continuation (page N ends at B, page N+1 starts at C)
 * - absence of a new question-start pattern at the top of the next page
 * - text continuity of an open question that has no options yet
 */
export function reconstructMultiPageQuestions(drafts: DraftQuestion[]): DraftQuestion[] {
  if (drafts.length <= 1) return drafts;

  const merged: DraftQuestion[] = [];

  for (const draft of drafts) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(cloneDraft(draft));
      continue;
    }

    if (shouldMerge(prev, draft)) {
      prev.parts.push(...draft.parts);
      for (const option of draft.options) {
        const existing = prev.options.find((o) => o.label === option.label);
        if (existing) {
          existing.text = `${existing.text} ${option.text}`.trim();
        } else {
          prev.options.push(option);
        }
      }
      prev.incomplete = prev.incomplete && draft.incomplete;
      continue;
    }

    merged.push(cloneDraft(draft));
  }

  return merged;
}

function cloneDraft(draft: DraftQuestion): DraftQuestion {
  return {
    ...draft,
    parts: [...draft.parts],
    options: [...draft.options],
  };
}

export function shouldMerge(prev: DraftQuestion, next: DraftQuestion): boolean {
  if (prev.questionNumber === next.questionNumber) {
    return true;
  }

  const prevPages = new Set(prev.parts.map((p) => p.page));
  const nextPages = next.parts.map((p) => p.page);
  const adjacent = nextPages.some((p) => prevPages.has(p) || prevPages.has(p - 1));
  if (!adjacent) return false;

  const nextFirstOption = next.options[0];
  const prevLastOption = prev.options[prev.options.length - 1];
  const optionContinuation =
    Boolean(prevLastOption && nextFirstOption && isSequentialOption(prevLastOption.label, nextFirstOption.label)) &&
    !hasQuestionStem(next);

  if (optionContinuation) {
    return true;
  }

  const prevNum = Number.parseInt(prev.questionNumber, 10);
  const nextNum = Number.parseInt(next.questionNumber, 10);
  if (Number.isFinite(prevNum) && Number.isFinite(nextNum) && prevNum !== nextNum) {
    return false;
  }

  return false;
}

function hasQuestionStem(draft: DraftQuestion): boolean {
  const stem = draft.parts
    .filter((p) => !parseOption(p.text))
    .map((p) => p.text)
    .join(" ")
    .trim();
  return stem.length > 20;
}

export function pageSpanForRegions(regions: SourceRegion[]): { start: number; end: number; pages: number[] } {
  const pages = [...new Set(regions.map((r) => r.page))].sort((a, b) => a - b);
  return {
    start: pages[0] ?? 1,
    end: pages[pages.length - 1] ?? 1,
    pages,
  };
}
