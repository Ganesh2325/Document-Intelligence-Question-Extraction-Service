import { describe, expect, it } from "vitest";
import { extractQuestionsFromPages, matchAnswers, normalizeAnswerKeyText } from "@folio/shared";

describe("worker extraction pipeline (pure stages)", () => {
  it("extracts questions then matches a separate answer key without inventing values", () => {
    const paper = extractQuestionsFromPages([
      {
        pageNumber: 1,
        text: "1. Which planet is nearest the Sun?\nA. Mercury\nB. Venus\nC. Earth\nD. Mars\n2. Define gravity.",
        items: [],
        hasSelectableText: true,
        usedOcr: false,
        width: 600,
        height: 800,
      },
    ]);
    const key = normalizeAnswerKeyText("Answer Key\n1-A\n2-B\n1-C");
    const matches = matchAnswers(
      paper.questions.map((q) => ({ questionNumber: q.questionNumber })),
      key,
    );
    expect(paper.questions).toHaveLength(2);
    expect(matches[0]?.status).toBe("UNCERTAIN");
    expect(matches[0]?.value).toBeNull();
    expect(matches[1]?.value).toBe("B");
  });
});
