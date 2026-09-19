export interface QuestionStartMatch {
  questionNumber: string;
  style: string;
  rest: string;
  confidence: number;
}

const PATTERNS: Array<{ style: string; confidence: number; regex: RegExp }> = [
  { style: "question-no", confidence: 0.97, regex: /^question\s+(?:no\.?|number|#)\s*([0-9]+[A-Za-z]?)\s*[.)\-:]?\s*(.*)$/i },
  { style: "question", confidence: 0.96, regex: /^question\s+([0-9]+[A-Za-z]?)\s*[.)\-:]?\s*(.*)$/i },
  { style: "q-dot", confidence: 0.94, regex: /^q(?:n)?\.?\s*([0-9]+[A-Za-z]?)\s*[.)\-:]?\s*(.*)$/i },
  { style: "paren", confidence: 0.9, regex: /^\(([0-9]+[A-Za-z]?)\)\s+(.*)$/ },
  { style: "paren-close", confidence: 0.88, regex: /^([0-9]+[A-Za-z]?)\)\s+(.*)$/ },
  { style: "dotted", confidence: 0.86, regex: /^([0-9]+[A-Za-z]?)\.\s+(.*)$/ },
];

export function matchQuestionStart(line: string): QuestionStartMatch | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  for (const pattern of PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (!match) continue;
    const questionNumber = match[1] ?? "";
    const rest = (match[2] ?? "").trim();
    if (!questionNumber) continue;
    if (pattern.style === "dotted" && isLikelyOptionLine(trimmed)) continue;
    return {
      questionNumber: normalizeQuestionNumber(questionNumber),
      style: pattern.style,
      rest,
      confidence: pattern.confidence,
    };
  }

  return null;
}

export function normalizeQuestionNumber(value: string): string {
  return value.replace(/^0+/, "") || "0";
}

export function isLikelyOptionLine(line: string): boolean {
  return /^(?:\(?[A-Da-d]\)|[A-Da-d][.)]|[A-D]\s[-–])\s+/.test(line.trim());
}

export const ANSWER_KEY_HEADERS = [
  /^\s*answer\s*key\b/i,
  /^\s*answers?\s*:?\s*$/i,
  /^\s*key\s+to\s+(?:the\s+)?answers?\b/i,
  /^\s*marking\s+scheme\b/i,
  /^\s*correct\s+answers?\b/i,
];

export function isAnswerKeyHeading(line: string): boolean {
  const trimmed = line.trim();
  return ANSWER_KEY_HEADERS.some((re) => re.test(trimmed));
}

export function looksLikeAnswerKeyDocument(text: string): boolean {
  const sample = text.slice(0, 2500);
  const heading = ANSWER_KEY_HEADERS.some((re) => re.test(sample));
  const denseEntries = sample.split(/\n/).filter((l) => matchAnswerEntry(l)).length;
  return heading || denseEntries >= 8;
}

export interface AnswerEntryMatch {
  questionNumber: string;
  value: string;
  raw: string;
  format: string;
}

const ANSWER_ENTRY_PATTERNS: Array<{ format: string; regex: RegExp }> = [
  { format: "dash", regex: /^(?:q(?:uestion)?\s*)?([0-9]+[A-Za-z]?)\s*[-–—:]\s*\(?([A-D]|true|false|t|f|[a-d]|yes|no)\)?\s*\.?$/i },
  { format: "equals", regex: /^(?:q(?:uestion)?\s*)?([0-9]+[A-Za-z]?)\s*=\s*\(?([A-D]|true|false|t|f|[a-d])\)?\s*$/i },
  { format: "dotted-paren", regex: /^(?:q(?:uestion)?\s*)?([0-9]+[A-Za-z]?)\s*[.)]\s*\(?([A-Da-d]|true|false)\)?\s*$/i },
  { format: "colon", regex: /^(?:q(?:uestion)?\s*)?([0-9]+[A-Za-z]?)\s*:\s*\(?([A-Da-d]|true|false)\)?\s*$/i },
];

export function matchAnswerEntry(line: string): AnswerEntryMatch | null {
  const trimmed = line.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  for (const pattern of ANSWER_ENTRY_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (!match) continue;
    return {
      questionNumber: normalizeQuestionNumber(match[1] ?? ""),
      value: normalizeAnswerValue(match[2] ?? ""),
      raw: trimmed,
      format: pattern.format,
    };
  }
  return null;
}

export function normalizeAnswerValue(value: string): string {
  const v = value.trim().toUpperCase();
  if (v === "T" || v === "TRUE" || v === "YES") return "TRUE";
  if (v === "F" || v === "FALSE" || v === "NO") return "FALSE";
  return v;
}

export function parseInlineAnswerKey(text: string): AnswerEntryMatch[] {
  const results: AnswerEntryMatch[] = [];
  const compact = text.replace(/\n/g, " ");
  const inline = compact.matchAll(
    /(?:Q(?:uestion)?\s*)?(\d+[A-Za-z]?)\s*[-–:.)]\s*\(?([A-Da-d]|TRUE|FALSE|True|False)\)?/g,
  );
  for (const match of inline) {
    results.push({
      questionNumber: normalizeQuestionNumber(match[1] ?? ""),
      value: normalizeAnswerValue(match[2] ?? ""),
      raw: match[0] ?? "",
      format: "inline",
    });
  }
  return results;
}
