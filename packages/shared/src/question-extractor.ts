import type { QuestionType, SourceRegion } from "@folio/types";
import { classifyLine } from "./line-classifier.js";
import { isSequentialOption, mergeOptionContinuation, parseOption } from "./option-parser.js";
import { isAnswerKeyHeading, matchAnswerEntry, matchQuestionStart } from "./question-patterns.js";
import { detectQuestionType } from "./question-type.js";
import { reconstructMultiPageQuestions, type DraftQuestion } from "./multi-page.js";

export interface TextItem {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

export interface PageContent {
  pageNumber: number;
  text: string;
  items: TextItem[];
  hasSelectableText: boolean;
  usedOcr: boolean;
  ocrConfidence?: number;
  width: number;
  height: number;
}

export interface ExtractedOption {
  label: string;
  text: string;
  confidence: number;
}

export interface ExtractedQuestion {
  questionNumber: string;
  questionText: string;
  questionType: QuestionType;
  typeConfidence: number;
  options: ExtractedOption[];
  startPage: number;
  endPage: number;
  sourcePages: number[];
  sourceRegions: SourceRegion[];
  numberingConfidence: number;
  boundaryConfidence: number;
  incomplete: boolean;
  warnings: string[];
}

export interface ExtractedAnswerKey {
  entries: Array<{
    questionNumber: string;
    value: string;
    raw: string;
    format: string;
    page: number;
  }>;
  location: "beginning" | "end" | "section" | "separate" | "none";
  headingPage?: number;
}

export interface ExtractionResult {
  questions: ExtractedQuestion[];
  answerKey: ExtractedAnswerKey;
  documentWarnings: string[];
  detectedAsAnswerKey: boolean;
}

export function clusterItemsIntoLines(items: TextItem[], yTolerance = 4): TextItem[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: TextItem[] = [];
  let current: TextItem | null = null;

  for (const item of sorted) {
    const text = item.text.replace(/\s+/g, " ");
    if (!text.trim()) continue;
    if (
      current &&
      current.page === item.page &&
      Math.abs(current.y - item.y) <= yTolerance
    ) {
      const gap: number = item.x - (current.x + current.width);
      const joiner: string = gap > 1.5 ? " " : "";
      const merged: TextItem = {
        text: `${current.text}${joiner}${text}`.replace(/\s+/g, " "),
        page: current.page,
        x: Math.min(current.x, item.x),
        y: current.y,
        width: Math.max(current.width, item.x + item.width - current.x),
        height: Math.max(current.height, item.height),
        confidence: current.confidence,
      };
      current = merged;
    } else {
      if (current) lines.push(current);
      current = { ...item, text };
    }
  }
  if (current) lines.push(current);
  return lines;
}

function regionFromItems(items: TextItem[]): SourceRegion[] {
  const byPage = new Map<number, TextItem[]>();
  for (const item of items) {
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }
  const regions: SourceRegion[] = [];
  for (const [page, pageItems] of byPage) {
    const minX = Math.min(...pageItems.map((i) => i.x));
    const maxX = Math.max(...pageItems.map((i) => i.x + i.width));
    const minY = Math.min(...pageItems.map((i) => i.y));
    const maxY = Math.max(...pageItems.map((i) => i.y + i.height));
    regions.push({
      page,
      x: round(minX),
      y: round(minY),
      width: round(maxX - minX),
      height: round(maxY - minY),
    });
  }
  return regions;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function fallbackLinesFromText(pages: PageContent[]): TextItem[] {
  const items: TextItem[] = [];
  for (const page of pages) {
    if (page.items.length > 0) {
      items.push(...page.items);
      continue;
    }
    const lines = page.text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (!line.trim()) return;
      items.push({
        text: line,
        page: page.pageNumber,
        x: 0,
        y: Math.max(0, (page.height || 800) - idx * 16),
        width: page.width || 600,
        height: 14,
        confidence: page.ocrConfidence,
      });
    });
  }
  return items;
}

export function extractQuestionsFromPages(pages: PageContent[]): ExtractionResult {
  const items = fallbackLinesFromText(pages);
  const lines = clusterItemsIntoLines(items);
  const documentWarnings: string[] = [];
  const fullText = pages.map((p) => p.text).join("\n");

  const answerKey: ExtractedAnswerKey = {
    entries: [],
    location: "none",
  };

  let inAnswerKey = false;
  let answerKeyStartedAt: number | null = null;
  const drafts: DraftQuestion[] = [];
  let current: DraftQuestion | null = null;

  const pageCount = pages.length;
  const firstPageText = pages[0]?.text ?? "";
  const lastPageText = pages[pageCount - 1]?.text ?? "";

  if (isAnswerKeyHeading(firstPageText.split(/\n/)[0] ?? "") && matchAnswerDensity(pages.slice(0, 1))) {
    answerKey.location = "beginning";
  }

  for (const line of lines) {
    const kind = classifyLine(line.text, inAnswerKey);

    if (kind === "answer_key_heading") {
      inAnswerKey = true;
      answerKeyStartedAt = line.page;
      answerKey.headingPage = line.page;
      if (line.page >= pageCount) answerKey.location = "end";
      else if (line.page <= 1) answerKey.location = "beginning";
      else answerKey.location = "section";
      if (current) {
        drafts.push(current);
        current = null;
      }
      continue;
    }

    if (inAnswerKey) {
      const entry = matchAnswerEntry(line.text);
      if (entry) {
        answerKey.entries.push({
          ...entry,
          page: line.page,
        });
        continue;
      }
      if (matchQuestionStart(line.text) && line.text.length > 40) {
        inAnswerKey = false;
      } else {
        continue;
      }
    }

    const start = matchQuestionStart(line.text);
    if (start) {
      if (current) drafts.push(current);
      current = {
        questionNumber: start.questionNumber,
        numberingStyle: start.style,
        numberingConfidence: start.confidence,
        parts: [
          {
            text: start.rest || line.text,
            page: line.page,
            item: line,
          },
        ],
        options: [],
        incomplete: !start.rest,
      };
      continue;
    }

    const option = parseOption(line.text);
    if (option && current) {
      const last = current.options[current.options.length - 1];
      if (last && option.label === last.label) {
        last.text = mergeOptionContinuation(last.text, option.text);
      } else {
        current.options.push({
          label: option.label,
          text: option.text,
          confidence: option.confidence,
          page: line.page,
          item: line,
        });
      }
      current.parts.push({ text: line.text, page: line.page, item: line });
      continue;
    }

    if (current) {
      const lastOption = current.options[current.options.length - 1];
      if (
        lastOption &&
        !option &&
        !start &&
        line.text.trim().length > 0 &&
        !matchQuestionStart(line.text)
      ) {
        if (line.page === (lastOption.page ?? line.page)) {
          lastOption.text = mergeOptionContinuation(lastOption.text, line.text.trim());
        } else if (isSequentialOption(lastOption.label, parseOption(line.text)?.label ?? "")) {
          // handled above
        }
      }
      current.parts.push({ text: line.text, page: line.page, item: line });
    }
  }

  if (current) drafts.push(current);

  if (answerKey.entries.length === 0) {
    for (const line of lines) {
      const entry = matchAnswerEntry(line.text);
      if (entry) {
        answerKey.entries.push({ ...entry, page: line.page });
      }
    }
    if (answerKey.entries.length >= 3 && answerKey.location === "none") {
      const pagesUsed = answerKey.entries.map((e) => e.page);
      const minP = Math.min(...pagesUsed);
      const maxP = Math.max(...pagesUsed);
      if (minP >= Math.max(1, pageCount - 1)) answerKey.location = "end";
      else if (minP <= 1 && maxP <= 2) answerKey.location = "beginning";
      else answerKey.location = "section";
    }
  }

  const reconstructed = reconstructMultiPageQuestions(drafts);
  const detectedAsAnswerKey =
    answerKey.entries.length >= 5 && reconstructed.length <= Math.max(1, Math.floor(answerKey.entries.length / 4));

  if (detectedAsAnswerKey) {
    documentWarnings.push("Document appears to be an answer key rather than a question paper.");
  }

  const questions: ExtractedQuestion[] = reconstructed.map((draft) => {
    const pagesForQ = [...new Set(draft.parts.map((p) => p.page))].sort((a, b) => a - b);
    const itemsForQ = draft.parts.map((p) => p.item);
    const bodyText = draft.parts
      .filter((p) => !parseOption(p.text))
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const type = detectQuestionType({
      questionText: bodyText,
      optionLabels: draft.options.map((o) => o.label),
      optionTexts: draft.options.map((o) => o.text),
    });

    const warnings: string[] = [];
    const expectedMcq = type.type === "MCQ" || type.type === "MULTI_SELECT";
    const incomplete =
      draft.incomplete ||
      (expectedMcq && draft.options.length > 0 && draft.options.length < 2) ||
      bodyText.length < 8;

    if (incomplete) warnings.push("Question appears partially extracted.");
    if (expectedMcq && draft.options.length < 4 && draft.options.length > 0) {
      warnings.push("MCQ has fewer than four options.");
    }
    if (pagesForQ.length > 1) warnings.push("Question spans multiple pages.");

    const labels = draft.options.map((o) => o.label);
    for (let i = 1; i < labels.length; i++) {
      if (!isSequentialOption(labels[i - 1], labels[i]!)) {
        warnings.push("Option labels are not sequential.");
        break;
      }
    }

    return {
      questionNumber: draft.questionNumber,
      questionText: bodyText || `Question ${draft.questionNumber}`,
      questionType: type.type,
      typeConfidence: type.confidence,
      options: draft.options.map((o) => ({
        label: o.label,
        text: o.text,
        confidence: o.confidence,
      })),
      startPage: pagesForQ[0] ?? 1,
      endPage: pagesForQ[pagesForQ.length - 1] ?? 1,
      sourcePages: pagesForQ,
      sourceRegions: regionFromItems(itemsForQ),
      numberingConfidence: draft.numberingConfidence,
      boundaryConfidence: incomplete ? 0.55 : pagesForQ.length > 1 ? 0.78 : 0.9,
      incomplete,
      warnings,
    };
  });

  if (isAnswerKeyHeading(lastPageText) || matchAnswerDensity(pages.slice(-1))) {
    if (answerKey.location === "none" && answerKey.entries.length > 0) {
      answerKey.location = "end";
    }
  }

  if (questions.length === 0 && !detectedAsAnswerKey) {
    documentWarnings.push("No question boundaries were detected.");
  }

  questions.forEach((question, index) => {
    question.questionNumber = String(index + 1);
  });

  void fullText;
  void answerKeyStartedAt;

  return { questions, answerKey, documentWarnings, detectedAsAnswerKey };
}

function matchAnswerDensity(pages: PageContent[]): boolean {
  const lines = pages.flatMap((p) => p.text.split(/\n/));
  const hits = lines.filter((l) => matchAnswerEntry(l)).length;
  return hits >= 5;
}

export function extractAnswerKeyFromPages(pages: PageContent[]): ExtractedAnswerKey {
  return extractQuestionsFromPages(pages).answerKey;
}
