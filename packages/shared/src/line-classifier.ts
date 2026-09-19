import { isAnswerKeyHeading, isLikelyOptionLine, matchAnswerEntry, matchQuestionStart } from "./question-patterns.js";
import { parseOption } from "./option-parser.js";

export type LineKind =
  | "blank"
  | "heading"
  | "answer_key_heading"
  | "answer_entry"
  | "question_start"
  | "option"
  | "continuation"
  | "noise";

export interface ClassifiedLine {
  text: string;
  kind: LineKind;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function classifyLine(text: string, inAnswerKeySection: boolean): LineKind {
  const trimmed = text.trim();
  if (!trimmed) return "blank";
  if (isAnswerKeyHeading(trimmed)) return "answer_key_heading";
  if (inAnswerKeySection && matchAnswerEntry(trimmed)) return "answer_entry";
  if (!inAnswerKeySection && matchAnswerEntry(trimmed) && trimmed.length < 24) return "answer_entry";
  if (matchQuestionStart(trimmed)) return "question_start";
  if (parseOption(trimmed) || isLikelyOptionLine(trimmed)) return "option";
  if (/^(section|part|instructions?|directions?)\b/i.test(trimmed)) return "heading";
  if (trimmed.length <= 2) return "noise";
  return "continuation";
}
