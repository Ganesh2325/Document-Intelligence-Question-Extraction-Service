export interface ParsedOption {
  label: string;
  text: string;
  confidence: number;
  style: string;
}

const OPTION_PATTERNS: Array<{ style: string; confidence: number; regex: RegExp }> = [
  { style: "A.", confidence: 0.96, regex: /^([A-D])\.\s+(.*)$/ },
  { style: "(a)", confidence: 0.95, regex: /^\(([a-d])\)\s+(.*)$/ },
  { style: "a)", confidence: 0.9, regex: /^([a-d])\)\s+(.*)$/ },
  { style: "a.", confidence: 0.86, regex: /^([a-d])\.\s+(.*)$/ },
  { style: "A)", confidence: 0.92, regex: /^([A-D])\)\s+(.*)$/ },
  { style: "(A)", confidence: 0.94, regex: /^\(([A-D])\)\s+(.*)$/ },
];

export function parseOption(line: string): ParsedOption | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const pattern of OPTION_PATTERNS) {
    const match = trimmed.match(pattern.regex);
    if (!match) continue;
    const text = (match[2] ?? "").trim();
    if (!text) continue;
    return {
      label: (match[1] ?? "").toUpperCase(),
      text,
      confidence: pattern.confidence,
      style: pattern.style,
    };
  }
  return null;
}

export function isSequentialOption(previous: string | undefined, next: string): boolean {
  if (!previous) return /^[A1]$/i.test(next);
  const prevCode = previous.toUpperCase().charCodeAt(0);
  const nextCode = next.toUpperCase().charCodeAt(0);
  return nextCode === prevCode + 1;
}

export function mergeOptionContinuation(existing: string, extra: string): string {
  return `${existing} ${extra}`.replace(/\s+/g, " ").trim();
}
