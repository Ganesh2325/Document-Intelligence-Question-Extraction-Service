import { describe, expect, it } from "vitest";
import { reconstructMultiPageQuestions, shouldMerge, type DraftQuestion } from "../src/multi-page.js";

function draft(partial: Partial<DraftQuestion> & Pick<DraftQuestion, "questionNumber">): DraftQuestion {
  return {
    numberingStyle: "dotted",
    numberingConfidence: 0.9,
    parts: [],
    options: [],
    incomplete: false,
    ...partial,
  };
}

describe("multi-page reconstruction", () => {
  it("merges option continuation across a page boundary into one question", () => {
    const q14page4 = draft({
      questionNumber: "14",
      parts: [
        {
          text: "Question 14: Which of the following is a noble gas?",
          page: 4,
          item: { text: "Question 14", page: 4, x: 0, y: 100, width: 200, height: 12 },
        },
      ],
      options: [
        { label: "A", text: "Oxygen", confidence: 0.9, page: 4, item: { text: "A", page: 4, x: 0, y: 80, width: 40, height: 12 } },
        { label: "B", text: "Nitrogen", confidence: 0.9, page: 4, item: { text: "B", page: 4, x: 0, y: 60, width: 40, height: 12 } },
      ],
    });
    const continuation = draft({
      questionNumber: "14b",
      parts: [
        {
          text: "C. Helium",
          page: 5,
          item: { text: "C. Helium", page: 5, x: 0, y: 700, width: 80, height: 12 },
        },
      ],
      options: [
        { label: "C", text: "Helium", confidence: 0.9, page: 5, item: { text: "C", page: 5, x: 0, y: 700, width: 40, height: 12 } },
        { label: "D", text: "Chlorine", confidence: 0.9, page: 5, item: { text: "D", page: 5, x: 0, y: 680, width: 40, height: 12 } },
      ],
    });

    expect(shouldMerge(q14page4, continuation)).toBe(true);
    const merged = reconstructMultiPageQuestions([q14page4, continuation]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.options.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
    expect(merged[0]?.parts.some((p) => p.page === 4)).toBe(true);
    expect(merged[0]?.parts.some((p) => p.page === 5)).toBe(true);
  });

  it("does not merge a following numbered question", () => {
    const q14 = draft({
      questionNumber: "14",
      parts: [{ text: "Question 14: ...", page: 5, item: { text: "Q14", page: 5, x: 0, y: 100, width: 20, height: 12 } }],
      options: [
        { label: "A", text: "One", confidence: 0.9, page: 5, item: { text: "A", page: 5, x: 0, y: 80, width: 20, height: 12 } },
        { label: "B", text: "Two", confidence: 0.9, page: 5, item: { text: "B", page: 5, x: 0, y: 60, width: 20, height: 12 } },
        { label: "C", text: "Three", confidence: 0.9, page: 5, item: { text: "C", page: 5, x: 0, y: 40, width: 20, height: 12 } },
        { label: "D", text: "Four", confidence: 0.9, page: 5, item: { text: "D", page: 5, x: 0, y: 20, width: 20, height: 12 } },
      ],
    });
    const q15 = draft({
      questionNumber: "15",
      parts: [{ text: "Question 15: Define force.", page: 5, item: { text: "Q15", page: 5, x: 0, y: 10, width: 20, height: 12 } }],
    });
    const merged = reconstructMultiPageQuestions([q14, q15]);
    expect(merged).toHaveLength(2);
    expect(merged.map((q) => q.questionNumber)).toEqual(["14", "15"]);
  });
});
