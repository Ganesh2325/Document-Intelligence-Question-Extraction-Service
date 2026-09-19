import { describe, expect, it } from "vitest";
import { extractQuestionsFromPages } from "../src/question-extractor.js";

describe("question extraction", () => {
  it("extracts numbered questions, options, and types from a clean paper", () => {
    const text = `
Physics Paper
1. Which of the following is a vector quantity?
A. Mass
B. Speed
C. Velocity
D. Time
2. True or false: The boiling point of water is 100°C at 1 atm.
(a) True
(b) False
3. Explain why the sky appears blue.
`;
    const result = extractQuestionsFromPages([
      {
        pageNumber: 1,
        text,
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
    ]);
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]?.questionType).toBe("MCQ");
    expect(result.questions[0]?.options).toHaveLength(4);
    expect(result.questions[1]?.questionType).toBe("TRUE_FALSE");
    expect(result.questions[2]?.questionType).toBe("LONG_ANSWER");
  });

  it("keeps a multi-page question as a single record", () => {
    const page4 = `
Question 14: Which of the following is a noble gas?
A. Oxygen
B. Nitrogen
`;
    const page5 = `
C. Helium
D. Chlorine
Question 15: Define isotope.
`;
    const result = extractQuestionsFromPages([
      {
        pageNumber: 4,
        text: page4,
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
      {
        pageNumber: 5,
        text: page5,
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
    ]);
    const q14 = result.questions.find((q) => q.questionNumber === "14");
    expect(q14).toBeDefined();
    expect(q14?.sourcePages).toEqual([4, 5]);
    expect(q14?.options.map((o) => o.label)).toEqual(["A", "B", "C", "D"]);
    expect(result.questions.some((q) => q.questionNumber === "15")).toBe(true);
  });

  it("detects an answer-key section", () => {
    const result = extractQuestionsFromPages([
      {
        pageNumber: 1,
        text: "1. Which planet is nearest to the Sun?\nA. Mercury\nB. Venus\nC. Earth\nD. Mars",
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
      {
        pageNumber: 2,
        text: "Answer Key\n1-A\n2-B\n3-C",
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
    ]);
    expect(result.answerKey.location).toBe("end");
    expect(result.answerKey.entries.map((e) => e.value)).toEqual(["A", "B", "C"]);
  });
});
