import { describe, expect, it } from "vitest";
import { matchAnswers } from "../src/answer-matcher.js";
import { normalizeAnswerKeyText } from "../src/answer-normalizer.js";

describe("answer matching", () => {
  it("matches by question number", () => {
    const key = normalizeAnswerKeyText("1-A\n2-B\n3-C");
    const matches = matchAnswers(
      [{ questionNumber: "1" }, { questionNumber: "2" }, { questionNumber: "4" }],
      key,
    );
    expect(matches[0]).toMatchObject({ value: "A", status: "MATCHED" });
    expect(matches[1]).toMatchObject({ value: "B", status: "MATCHED" });
    expect(matches[2]).toMatchObject({ value: null, status: "MISSING" });
  });

  it("never invents an answer when the key conflicts", () => {
    const key = normalizeAnswerKeyText("1-A\n1-C");
    const matches = matchAnswers([{ questionNumber: "1" }], key);
    expect(matches[0]?.value).toBeNull();
    expect(matches[0]?.status).toBe("UNCERTAIN");
  });
});
