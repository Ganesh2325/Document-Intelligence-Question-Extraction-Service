import { describe, expect, it } from "vitest";
import { normalizeAnswerKeyText } from "../src/answer-normalizer.js";

describe("answer normalization", () => {
  it("normalizes dash, colon, and dotted formats", () => {
    const text = ["1-A", "Q2: B", "3. (C)", "Question 4 - D"].join("\n");
    const entries = normalizeAnswerKeyText(text);
    expect(entries.map((e) => `${e.questionNumber}:${e.value}`)).toEqual([
      "1:A",
      "2:B",
      "3:C",
      "4:D",
    ]);
  });

  it("marks conflicting values without choosing a winner", () => {
    const entries = normalizeAnswerKeyText("1-A\n1-B");
    expect(entries[0]?.format).toBe("conflict");
  });
});
